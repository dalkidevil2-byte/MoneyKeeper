import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const KST = 'Asia/Seoul';

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
  card_last4: string;      // '1810' (끝 4자리를 주는 카드사)
  card_alias: string;      // '생활비카드' (끝자리 대신 카드 별칭을 주는 곳 — 토스뱅크 등)
  approved: boolean;       // false = 취소/환불
  amount: number | null;
  installment: string;     // '일시불' | '3개월' 등
  date: string | null;     // 'YYYY-MM-DD'
  occurred_at: string | null; // 'YYYY-MM-DDTHH:mm' (시각을 안 주는 카드사는 null)
  merchant: string;
  note: string;            // 가맹점 대신 남길 부가 설명 (상품권 사용 등)
  payer_masked: string;    // 알림에 적힌 마스킹된 결제자 이름 (예: '김*진')
}

// 개인 카톡 대화가 서버로 넘어오지 않도록 하는 1차 방어선.
// 폰 쪽에서 발신자/단어 필터를 거는 것이 기본이고, 이건 그게 뚫렸을 때의 안전망.
export function looksLikeCardNotification(text: string): boolean {
  // 금액이 없으면 무조건 아님
  if (!/\d[\d,]*\s*원/.test(text)) return false;

  // 카드사 표준 문구 — 이건 단독으로 인정
  if (/(승인|취소)/.test(text)) return true;

  // '결제/출금' 만 쓰는 곳(토스뱅크·온누리상품권 등)은
  // '카드/뱅크/은행/상품권' 이 함께 있을 때만 인정.
  // ("그거 5천원 결제했어" 같은 개인 대화가 넘어오는 것을 막기 위함)
  return /(결제|출금)/.test(text) && /(카드|뱅크|은행|상품권)/.test(text);
}

// 한 번의 결제가 두 곳에서 알림으로 오는 경우가 있다.
// 온누리상품권으로 결제하면 '디지털온누리' 와 '삼성카드' 가 동시에 알림을 보낸다.
//   - 온누리 쪽: "이마트24 보정현대점에서 1,700원이 결제되었습니다" → 가맹점 있음 ✅
//   - 삼성카드 쪽: "1,700원 승인(온누리상품권 1,700원 사용) *결제대금에 미포함" → 가맹점 없음
// 정보가 많은 온누리 쪽만 등록하고, 삼성카드 쪽은 저장 없이 버린다. (이중 등록 방지)
export function isDuplicateSourceNotification(text: string): boolean {
  if (/결제대금에\s*미포함/.test(text)) return true;
  return /\[?삼성카드\]?[^\n]{0,40}상품권[^\n]{0,20}사용/.test(text);
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

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 서버(Vercel)는 UTC 로 돈다. dayjs() 를 그대로 쓰면 한국 시간 오전 9시 이전 결제가
// 전날 거래로 기록된다. 날짜가 없는 알림(토스뱅크·온누리)은 이 값을 써야 한다.
export function todayKst(): string {
  return dayjs().tz(KST).format('YYYY-MM-DD');
}

// 카드 알림에는 연도가 없다 (08/08).
// 오늘 기준으로 30일 넘게 미래면 작년 건으로 본다 (12월/1월 경계 대응).
function resolveYear(month: number, day: number): number {
  const today = dayjs().tz(KST);
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

// '회원님', '고객님' 처럼 사람 이름이 아닌 호칭. 이름으로 착각하면 안 된다.
const NOT_A_NAME = /^(회원|고객|손님|사장|여러분|사용자|이용자)$/;

// 알림에 적힌 결제자 이름을 뽑는다.
//   삼성:   "삼성4530승인 김*진"
//   토스:   "김*진님의 생활비카드 카드"
//   온누리: "김*희님, 이마트24 보정현대점에서 ..."  (마스킹)
//           "김성진님, 공간&아지트 골프존파크에서 ..." (마스킹 없이 오기도 한다)
//
// 마스킹된 형태를 먼저 찾고, 없으면 마스킹 없는 이름도 받는다.
// 마스킹 없는 쪽은 아무 단어나 걸릴 수 있어 호칭을 걸러내고,
// 최종적으로는 '구성원 이름과 일치하는 사람이 딱 한 명일 때만' 인정하므로 안전하다.
function extractMaskedPayer(text: string): string {
  const m =
    text.match(/([가-힣]\*[가-힣]{1,2})님[의,]/) ??
    text.match(/(?:승인|취소)\s*([가-힣]\*[가-힣]{1,2})/) ??
    text.match(/([가-힣]{2,4})님[의,]/);
  const name = m?.[1] ?? '';
  return NOT_A_NAME.test(name) ? '' : name;
}

// 카드사 이름을 알림에서 직접 읽는 규칙(카카오 카드영수증 등)은 issuer_override 로 넘긴다
type RuleResult = Omit<ParsedCardNotification, 'matched' | 'rule' | 'issuer'> & {
  issuer_override?: string;
};

interface Rule {
  name: string;
  issuer: string;
  // 매칭 실패 시 null. 카드사마다 문구 구조가 크게 달라 규칙별 함수로 둔다.
  parse: (text: string) => RuleResult | null;
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
    parse: (text) => {
      const m = text.match(
        /삼성\s*(\d{4})\s*(승인|취소)[\s\S]{0,40}?([\d,]+)\s*원\s*([^\n]*?)\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s+([^\n]+)/,
      );
      if (!m) return null;

      const [, last4, approvalWord, amountText, installment, mm, dd, hh, mi, merchantRaw] = m;
      const month = parseInt(mm, 10);
      const day = parseInt(dd, 10);
      const year = resolveYear(month, day);
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        card_last4: last4,
        card_alias: '',
        approved: approvalWord === '승인',
        amount: toInt(amountText),
        installment: (installment ?? '').trim(),
        date,
        occurred_at: `${date}T${String(parseInt(hh, 10)).padStart(2, '0')}:${mi}`,
        merchant: stripTrailingNoise(merchantRaw),
        note: '',
        payer_masked: extractMaskedPayer(text),
      };
    },
  },
  {
    // 토스뱅크 체크카드 알림톡
    //   [토스뱅크] 체크카드 국내 결제
    //   김*진님의 생활비카드 카드
    //   53,200원 결제 | 쿠팡(쿠페이)
    //   잔액 50,110원
    //
    // 삼성과 다른 점: '승인' 대신 '결제', 카드 끝자리 대신 별칭, 결제 시각 없음.
    name: 'tossbank-v1',
    issuer: '토스뱅크',
    parse: (text) => {
      const head = text.match(/\[토스뱅크\][^\n]*?(결제|승인|취소|출금)/);
      if (!head) return null;

      // "53,200원 결제 | 쿠팡(쿠페이)" — 뒤에 '|' 와 가맹점이 반드시 따라온다.
      // 마지막 줄 "잔액 50,110원" 은 '|' 가 없어서 여기에 걸리지 않는다.
      const body = text.match(/([\d,]+)\s*원\s*(결제|승인|취소|출금)?\s*\|\s*([^\n]+)/);
      if (!body) return null;

      const amount = toInt(body[1]);
      if (amount === null) return null;

      const action = body[2] || head[1];

      // "김*진님의 생활비카드 카드" → 별칭은 '생활비카드'.
      // 별칭 자체가 '카드' 로 끝나므로 최소 매칭을 쓰면 '생활비' 로 잘린다.
      // 뒤에서부터 독립된 '카드' 를 찾도록 최대 매칭 + 숫자/파이프 제외로 범위를 묶는다.
      const alias = text.match(/님의\s*([^\n|\d]+)\s*카드(?=\s|$)/)?.[1]?.trim() ?? '';

      return {
        card_last4: '',
        card_alias: alias,
        approved: !/취소/.test(action),
        amount,
        installment: '',
        // 알림에 결제 시각이 없다. 알림은 결제 직후 오므로 오늘 날짜로 둔다.
        date: todayKst(),
        occurred_at: null,
        merchant: stripTrailingNoise(body[3]),
        note: '',
        payer_masked: extractMaskedPayer(text),
      };
    },
  },
  {
    // 디지털온누리상품권 알림톡
    //   상품권사용
    //   1,700원
    //   [디지털온누리상품권]
    //   홍*동님, 이마트24 보정현대점에서 1,700원이 결제되었습니다.
    //   결제 후 잔액 : 650원
    //
    // 같은 결제를 삼성카드도 알리지만 가맹점이 없어서, 이쪽만 등록한다.
    name: 'onnuri-v1',
    issuer: '온누리상품권',
    parse: (text) => {
      const m = text.match(
        /온누리상품권\][\s\S]{0,40}?님,\s*(.+?)에서\s*([\d,]+)\s*원이\s*(결제|취소|환불)/,
      );
      if (!m) return null;

      const amount = toInt(m[2]);
      if (amount === null) return null;

      return {
        card_last4: '',
        // 결제수단 이름이 '주희 온누리' 처럼 짧을 수 있어 '온누리' 로 맞춘다.
        // (이 값으로 payment_methods.name 을 부분 검색해 자동 연결한다)
        card_alias: '온누리',
        approved: m[3] === '결제',
        amount,
        installment: '',
        // 알림에 결제 시각이 없다. 알림은 결제 직후 오므로 오늘 날짜로 둔다.
        date: todayKst(),
        occurred_at: null,
        merchant: stripTrailingNoise(m[1]),
        note: '온누리상품권 사용',
        payer_masked: extractMaskedPayer(text),
      };
    },
  },
  {
    // 카카오톡 카드영수증 (KB국민 등) — 라벨/값 형태라 앞의 카드사들과 구조가 다르다.
    //   결제가 승인되었어요.
    //   28,000원
    //   CJ CGV_영화관람권(온라인)
    //   카드      KB국민 신용카드(9063)
    //   거래유형   국내 승인
    //   거래일시   2026.08.10 16:49:23
    //   할부      일시불
    //
    // 이 형식은 연도까지 주므로 날짜 추정이 필요 없다.
    name: 'kakao-receipt-v1',
    issuer: '', // 카드사 이름을 알림에서 직접 읽는다
    parse: (text) => {
      // '카드' 라벨 뒤: "KB국민 신용카드(9063)" / "신한 체크카드(1234)"
      const cardM = text.match(/카드\s*[:\s]\s*([가-힣A-Za-z]+)\s*(?:신용|체크|)\s*카드\s*\(?(\d{4})\)?/);
      if (!cardM) return null;

      const amountM = text.match(/([\d,]+)\s*원/);
      if (!amountM) return null;
      const amount = toInt(amountM[1]);
      if (amount === null) return null;

      // 금액 줄과 '카드' 라벨 사이가 가맹점명
      const merchantM = text.match(/[\d,]+\s*원\s*\n?\s*([^\n]*?)\s*\n?\s*카드\s*[:\s]/);
      const merchant = stripTrailingNoise(merchantM?.[1] ?? '');

      // "거래일시 2026.08.10 16:49:23"
      const dtM = text.match(/거래일시\s*[:\s]\s*(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
      const date = dtM
        ? `${dtM[1]}-${pad2(parseInt(dtM[2], 10))}-${pad2(parseInt(dtM[3], 10))}`
        : todayKst();
      const occurredAt = dtM ? `${date}T${pad2(parseInt(dtM[4], 10))}:${dtM[5]}` : null;

      // "거래유형 국내 승인" / "국내 취소"
      const typeM = text.match(/거래유형\s*[:\s]\s*([^\n]+)/);
      const typeText = typeM?.[1] ?? '';
      const approved = !/(취소|환불)/.test(typeText) && !/(취소|환불)/.test(text.slice(0, 40));

      const inst = text.match(/할부\s*[:\s]\s*([^\n]+)/)?.[1]?.trim() ?? '';

      return {
        issuer_override: `${cardM[1]}카드`, // 'KB국민카드'
        card_last4: cardM[2],
        card_alias: cardM[1], // 'KB국민' — 결제수단 이름 매칭에도 쓸 수 있다
        approved,
        amount,
        installment: inst,
        date,
        occurred_at: occurredAt,
        merchant,
        note: '',
        payer_masked: extractMaskedPayer(text),
      };
    },
  },
];

const EMPTY: ParsedCardNotification = {
  matched: false,
  rule: '',
  issuer: '',
  card_last4: '',
  card_alias: '',
  approved: true,
  amount: null,
  installment: '',
  date: null,
  occurred_at: null,
  merchant: '',
  payer_masked: '',
  note: '',
};

export function parseCardNotification(rawText: string): ParsedCardNotification {
  const text = normalizeNotificationText(rawText);

  for (const rule of RULES) {
    const built = rule.parse(text);
    if (!built) continue;

    // 금액을 못 뽑았으면 매칭 실패로 취급 (잘못된 거래가 등록되는 것보다 낫다)
    if (built.amount === null) continue;

    const { issuer_override, ...rest } = built;
    return { matched: true, rule: rule.name, issuer: issuer_override ?? rule.issuer, ...rest };
  }

  return { ...EMPTY };
}

// 같은 결제가 두 번 들어오는 것을 막는 키.
// 누적금액처럼 매번 바뀌는 값은 제외하고, 결제 자체를 특정하는 값만 쓴다.
export function buildDedupeKey(parsed: ParsedCardNotification, normalizedText: string): string {
  if (!parsed.matched) {
    return `unparsed:${normalizedText.slice(0, 300)}`;
  }

  // 결제 시각을 주지 않는 카드사(토스뱅크 등)는 금액·가맹점만으로는
  // 같은 날 같은 곳에서 두 번 결제한 것을 중복으로 오인해 버린다.
  // 원문에 매번 달라지는 잔액이 들어있으므로 원문을 키로 쓴다.
  if (!parsed.occurred_at) {
    return `${parsed.issuer}|${normalizedText.slice(0, 300)}`;
  }

  return [
    parsed.issuer,
    parsed.card_last4 || parsed.card_alias,
    parsed.approved ? 'A' : 'C',
    parsed.amount,
    parsed.occurred_at,
    parsed.merchant,
  ].join('|');
}
