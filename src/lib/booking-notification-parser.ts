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
// '예약' 과 시각 표기가 동시에 있어야 인정한다.
//   '17:00' 같은 콜론 표기와 '오후 5시' 같은 한글 표기를 모두 받는다.
export function looksLikeBookingNotification(text: string): boolean {
  if (!/예약/.test(text)) return false;
  return /\d{1,2}\s*:\s*\d{2}/.test(text) || /\d{1,2}\s*시/.test(text);
}

// "지금 예약하세요", "예약 특가" 같은 광고는 걸러낸다.
// 확정된 예약은 보통 '되었/됐/완료/확정' 같은 완료형 표현을 쓴다.
// ('예약이 확정' 처럼 조사가 끼는 경우가 많아 조사를 허용한다)
export function isAdvertisement(text: string): boolean {
  if (CONFIRMED_RE.test(text)) return false;
  return /(특가|할인|이벤트|쿠폰|지금\s*예약|예약하세요|오픈)/.test(text);
}

/** '예약이 확정되었습니다' / '예약 완료' — 확정된 예약임을 나타내는 표현 */
const CONFIRMED_RE = /예약\s*(?:이|가|을|를)?\s*(?:정상\s*)?(?:됐|되었|완료|확정|접수)/;

/**
 * 날짜 표기.
 *   8.22 / 8/22 / 8-22 / 8월 22일 / 2026.8.22
 * 구분자가 반드시 있어야 하므로 '죽전2호점' 같은 가게 이름은 걸리지 않는다.
 */
const DATE_RE = /(?:(\d{4})\s*[.\-/]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/;

/**
 * 시각 표기.
 *   오후 5:00 / 17:00 / 오후 5시 / 오후 5시 30분
 * 콜론이나 '시' 가 있어야 하므로 '2명' 같은 숫자는 걸리지 않는다.
 */
const TIME_RE = /(오전|오후|아침|점심|저녁|밤)?\s*(\d{1,2})\s*(?::\s*(\d{2})|시\s*(?:(\d{1,2})\s*분)?)/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 오전/오후를 붙여 24시간제로. 오후 12시는 12시, 오전 12시는 0시. */
function to24h(meridiem: string | undefined, hour: number, minute: number): string {
  let h = hour;
  if (meridiem === '오후' || meridiem === '저녁' || meridiem === '밤') {
    if (h < 12) h += 12;
  } else if (meridiem === '오전' || meridiem === '아침') {
    if (h === 12) h = 0;
  }
  return `${pad(h)}:${pad(minute)}`;
}

/** TIME_RE 결과 → 'HH:mm' */
function timeFromMatch(m: RegExpMatchArray): string {
  const meridiem = m[1];
  const hour = parseInt(m[2], 10);
  const minute = parseInt(m[3] ?? m[4] ?? '0', 10);
  return to24h(meridiem, hour, minute);
}

/** 'HH:mm' 에 분을 더한다 (종료시각이 없는 예약의 기본 길이 계산용) */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map((v) => parseInt(v, 10));
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** DATE_RE 결과 → 'YYYY-MM-DD'. 지나간 날짜면 내년 예약으로 본다. */
function dateFromMatch(m: RegExpMatchArray): string {
  const today = dayjs();
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (m[1]) return `${m[1]}-${pad(month)}-${pad(day)}`;

  let year = today.year();
  const candidate = dayjs(`${year}-${pad(month)}-${pad(day)}`);
  // 지나간 날짜로 잡히면 내년 예약으로 본다 (12월에 1월 예약 등)
  if (candidate.isValid() && candidate.diff(today, 'day') < -30) year += 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

// "금일" / "명일" / "8/10" / "8.22" / "8월 10일" → YYYY-MM-DD
function resolveDate(text: string): string {
  const today = dayjs();

  const md = text.match(DATE_RE);
  if (md) return dateFromMatch(md);

  if (/(명일|내일)/.test(text)) return today.add(1, 'day').format('YYYY-MM-DD');
  if (/모레/.test(text)) return today.add(2, 'day').format('YYYY-MM-DD');
  // '금일/오늘' 이거나 날짜 언급이 없으면 알림이 온 날 = 예약일
  return today.format('YYYY-MM-DD');
}

/**
 * 날짜 앞에 붙어 있는 가게 이름을 뽑는다.
 *   '네이버지도 머바르지 죽전2호점 8.22(토) ...' → '머바르지 죽전2호점'
 * MacroDroid 가 알림 제목과 본문을 줄바꿈으로 이어 보내므로 마지막 줄만 본다.
 */
function extractPlace(textBeforeDate: string): string {
  const lastLine = textBeforeDate.split('\n').pop() ?? '';
  return lastLine
    .replace(/^\s*\[?\s*(네이버\s*지도|네이버\s*예약|네이버|NAVER)\s*\]?\s*/i, '')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
    // 네이버 지도 · 네이버 예약
    //   네이버지도 머바르지 죽전2호점 8.22(토) 오후 5:00 예약이 확정되었습니다.
    //
    // 가게 이름 + 날짜 + (오전/오후) 시각 조합이면 받는다.
    // 종료 시각을 주지 않으므로 1시간짜리 일정으로 잡는다.
    name: 'naver-booking-v1',
    parse: (text) => {
      if (!CONFIRMED_RE.test(text)) return null;

      const dm = text.match(DATE_RE);
      if (!dm || dm.index === undefined) return null;

      // 시각은 날짜 뒤에서 찾는다 — 가게 이름에 든 숫자를 시각으로 오인하지 않도록
      const after = text.slice(dm.index + dm[0].length);
      const tm = after.match(TIME_RE);
      if (!tm) return null;

      const startTime = timeFromMatch(tm);

      // '오후 5:00~7:00' 처럼 끝 시각까지 주면 그대로 쓴다.
      // 뒤쪽 시각에는 보통 오전/오후가 없으므로(7:00), 시작보다 이르면 오후로 본다.
      const tail = after.slice((tm.index ?? 0) + tm[0].length);
      const afterTilde = tail.replace(/^\s*[~-]\s*/, '');
      const endMatch = afterTilde.length < tail.length ? afterTilde.match(TIME_RE) : null;
      let endTime = addMinutes(startTime, 60);
      if (endMatch && endMatch.index === 0) {
        endTime = timeFromMatch(endMatch);
        if (!endMatch[1] && endTime < startTime) endTime = addMinutes(endTime, 12 * 60);
      }

      const place = extractPlace(text.slice(0, dm.index));
      const people = text.match(/(\d{1,2})\s*명/);

      return {
        title: place ? `${place} 예약` : '예약',
        date: dateFromMatch(dm),
        startTime,
        endTime,
        memo: ['📲 예약 알림 자동 등록 · 네이버', people ? `${people[1]}명` : '']
          .filter(Boolean)
          .join(' · '),
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
