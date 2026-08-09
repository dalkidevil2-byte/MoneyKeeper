import dayjs from 'dayjs';

// ─────────────────────────────────────────
// 예약 확정 알림 → 일정 파싱
//
// 카드 알림과 같은 구조. 폰(MacroDroid)이 알림 원문을 보내면
// 규칙으로 날짜·시간·제목을 뽑아 일정(tasks)으로 만든다.
//
// 규칙이 없는 곳은 matched=false → 일정을 만들지 않는다.
// (엉뚱한 일정이 캘린더에 들어가는 것보다 안 들어가는 편이 낫다)
// ─────────────────────────────────────────

export interface ParsedBooking {
  matched: boolean;
  rule: string;
  title: string;
  date: string | null;      // 'YYYY-MM-DD'
  startTime: string | null; // 'HH:mm'
  endTime: string | null;   // 'HH:mm'
  memo: string;
}

const EMPTY: ParsedBooking = {
  matched: false,
  rule: '',
  title: '',
  date: null,
  startTime: null,
  endTime: null,
  memo: '',
};

// 예약 알림이 아닌 것(광고·개인 대화)은 서버에 남기지도 않는다.
// '예약' 과 '시간(HH:MM)' 이 동시에 있어야 인정한다.
export function looksLikeBookingNotification(text: string): boolean {
  if (!/예약/.test(text)) return false;
  return /\d{1,2}\s*:\s*\d{2}/.test(text);
}

// "지금 예약하세요", "예약 특가" 같은 광고는 걸러낸다.
// 확정된 예약은 보통 '되었/됐/완료/확정' 같은 완료형 표현을 쓴다.
export function isAdvertisement(text: string): boolean {
  if (/(예약\s*(됐|되었|완료|확정))/.test(text)) return false;
  return /(특가|할인|이벤트|쿠폰|지금\s*예약|예약하세요|오픈)/.test(text);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// "금일" / "명일" / "8/10" / "8월 10일" → YYYY-MM-DD
function resolveDate(text: string): string {
  const today = dayjs();

  const md = text.match(/(\d{1,2})\s*[/월]\s*(\d{1,2})\s*일?/);
  if (md) {
    const month = parseInt(md[1], 10);
    const day = parseInt(md[2], 10);
    let year = today.year();
    const candidate = dayjs(`${year}-${pad(month)}-${pad(day)}`);
    // 지나간 날짜로 잡히면 내년 예약으로 본다 (12월에 1월 예약 등)
    if (candidate.isValid() && candidate.diff(today, 'day') < -30) year += 1;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  if (/(명일|내일)/.test(text)) return today.add(1, 'day').format('YYYY-MM-DD');
  if (/모레/.test(text)) return today.add(2, 'day').format('YYYY-MM-DD');
  // '금일/오늘' 이거나 날짜 언급이 없으면 알림이 온 날 = 예약일
  return today.format('YYYY-MM-DD');
}

interface Rule {
  name: string;
  parse: (text: string) => Omit<ParsedBooking, 'matched' | 'rule'> | null;
}

const RULES: Rule[] = [
  {
    // 레슨북 (골프 타석 예약)
    //   안녕하세요, 회원님! 금일 13:51~14:50까지 3번 타석예약 됐습니다.
    //   시작시간 15분 이내에 미입장시 노쇼처리 됩니다.
    name: 'lessonbook-golf-v1',
    parse: (text) => {
      const m = text.match(
        /(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})[^\n]{0,10}?(\d+)\s*번\s*타석/,
      );
      if (!m) return null;

      const [, sh, sm, eh, em, bay] = m;
      return {
        title: `골프 연습 (${bay}번 타석)`,
        date: resolveDate(text),
        startTime: `${pad(parseInt(sh, 10))}:${sm}`,
        endTime: `${pad(parseInt(eh, 10))}:${em}`,
        memo: '📲 예약 알림 자동 등록 · 레슨북',
      };
    },
  },
  {
    // 타석 번호 없이 시간만 주는 일반 예약 알림 (레슨북 외 대비)
    //   "... 8/10 14:00~15:00 예약이 완료되었습니다"
    name: 'generic-timerange-v1',
    parse: (text) => {
      if (!/예약\s*(이|가)?\s*(됐|되었|완료|확정)/.test(text)) return null;

      const m = text.match(/(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
      if (!m) return null;

      const [, sh, sm, eh, em] = m;
      return {
        title: '예약',
        date: resolveDate(text),
        startTime: `${pad(parseInt(sh, 10))}:${sm}`,
        endTime: `${pad(parseInt(eh, 10))}:${em}`,
        memo: '📲 예약 알림 자동 등록',
      };
    },
  },
];

export function parseBookingNotification(rawText: string): ParsedBooking {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();

  for (const rule of RULES) {
    const built = rule.parse(text);
    if (!built) continue;
    return { matched: true, rule: rule.name, ...built };
  }
  return { ...EMPTY };
}

// 같은 예약 알림이 두 번 와도 일정이 두 개 생기지 않도록 하는 키.
export function buildBookingKey(p: ParsedBooking): string {
  return [p.title, p.date, p.startTime, p.endTime].join('|');
}
