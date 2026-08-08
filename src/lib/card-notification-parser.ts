import dayjs from 'dayjs';

// ─────────────────────────────────────────
// 카드 결제 알림(카톡 알림톡 / 문자) → 거래 파싱
//
// 폰(Automate/MacroDroid 등)이 알림 원문을 그대로 보내면
// 카드사별 규칙으로 금액·가맹점·시각을 뽑아낸다.
//
// 규칙이 없는 카드사는 matched=false 로 두고 원문만 적재한다.
// (실제 문구를 모아서 나중에 규칙을 추가하기 위함)
// ─────────────────────────────────────────

export type CardNotificationSource = 'kakao' | 'sms' | 'unknown';

export interface ParsedCardNotification {
  matched: boolean;
  rule: string;            // 매칭된 규칙 이름 (디버깅용)
  issuer: string;          // '삼성카드'
  card_last4: string;      // '1810'
  approved: boolean;       // false = 취소/환불
  amount: number | null;
  installment: string;     // '일시불' | '3개월' 등
  date: string | null;     // 'YYYY-MM-DD'
  occurred_at: string | null; // 'YYYY-MM-DDTHH:mm'
  merchant: string;
}

// 개인 카톡 대화가 서버로 넘어오지 않도록 하는 1차 방어선.
// 폰 쪽에서 발신자 필터를 거는 것이 기본이고, 이건 그게 뚫렸을 때의 안전망.
// "금액(원)" + "승인/취소" 두 가지가 동시에 있어야만 카드 알림으로 인정한다.
export function looksLikeCardNotification(text: string): boolean {
  const hasAmount = /\d[\d,]*\s*원/.test(text);
  const hasApproval = /(승인|취소)/.test(text);
  return hasAmount && hasApproval;
}

// 제로폭/서식 문자 (U+200B~U+200F, U+FEFF). 소스에 보이지 않는 글자를 직접 넣지 않으려고 코드로 만든다.
const ZERO_WIDTH = new RegExp(
  '[' + String.fromCharCode(0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0xfeff) + ']',
  'g',
);

// 알림 원문 정리 — 줄바꿈은 살리고 공백만 정돈.
// 안드로이드 알림은 줄바꿈이 공백으로 뭉개져 오는 경우가 있어 양쪽 다 대응한다.
export function normalizeNotificationText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH, '') // 제로폭 문자 제거
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

function toInt(amountText: string): number | null {
  const n = parseInt(amountText.replace(/,/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// 카드 알림에는 연도가 없다 (08/08).
// 오늘 기준으로 30일 넘게 미래면 작년 건으로 본다 (12월/1월 경계 대응).
function resolveYear(month: number, day: number): number {
  const today = dayjs();
  const year = today.year();
  const candidate = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  if (!candidate.isValid()) return year;
  return candidate.diff(today, 'day') > 30 ? year - 1 : year;
}

// 가맹점명 뒤에 "누적 2,432,060원" 이 붙어오는 경우 잘라낸다.
// (줄바꿈이 공백으로 뭉개졌을 때 발생)
function stripTrailingNoise(merchant: string): string {
  return merchant
    .replace(/\s*누적\s*[\d,]+\s*원?.*$/, '')
    .replace(/\s*잔액\s*[\d,]+\s*원?.*$/, '')
    .replace(/\s*모바일에서.*$/, '')
    .trim();
}

interface Rule {
  name: string;
  issuer: string;
  pattern: RegExp;
  build: (m: RegExpMatchArray) => Omit<ParsedCardNotification, 'matched' | 'rule' | 'issuer'>;
}

const RULES: Rule[] = [
  {
    // 삼성카드 알림톡
    //   삼성1810승인 김*희
    //   56,500원 일시불
    //   08/08 19:45 주식회사에르모어
    //   누적2,432,060원
    name: 'samsung-v1',
    issuer: '삼성카드',
    pattern:
      /삼성\s*(\d{4})\s*(승인|취소)[\s\S]{0,40}?([\d,]+)\s*원\s*([^\n]*?)\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s+([^\n]+)/,
    build: (m) => {
      const [, last4, approvalWord, amountText, installment, mm, dd, hh, mi, merchantRaw] = m;
      const month = parseInt(mm, 10);
      const day = parseInt(dd, 10);
      const year = resolveYear(month, day);
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        card_last4: last4,
        approved: approvalWord === '승인',
        amount: toInt(amountText),
        installment: (installment ?? '').trim(),
        date,
        occurred_at: `${date}T${String(parseInt(hh, 10)).padStart(2, '0')}:${mi}`,
        merchant: stripTrailingNoise(merchantRaw),
      };
    },
  },
];

const EMPTY: ParsedCardNotification = {
  matched: false,
  rule: '',
  issuer: '',
  card_last4: '',
  approved: true,
  amount: null,
  installment: '',
  date: null,
  occurred_at: null,
  merchant: '',
};

export function parseCardNotification(rawText: string): ParsedCardNotification {
  const text = normalizeNotificationText(rawText);

  for (const rule of RULES) {
    const m = text.match(rule.pattern);
    if (!m) continue;

    const built = rule.build(m);
    // 금액을 못 뽑았으면 매칭 실패로 취급 (잘못된 거래가 등록되는 것보다 낫다)
    if (built.amount === null) continue;

    return { matched: true, rule: rule.name, issuer: rule.issuer, ...built };
  }

  return { ...EMPTY };
}

// 같은 결제가 두 번 들어오는 것을 막는 키.
// 누적금액처럼 매번 바뀌는 값은 제외하고, 결제 자체를 특정하는 값만 쓴다.
export function buildDedupeKey(parsed: ParsedCardNotification, normalizedText: string): string {
  if (!parsed.matched) {
    return `unparsed:${normalizedText.slice(0, 300)}`;
  }
  return [
    parsed.issuer,
    parsed.card_last4,
    parsed.approved ? 'A' : 'C',
    parsed.amount,
    parsed.occurred_at,
    parsed.merchant,
  ].join('|');
}
