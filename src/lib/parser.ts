import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { ParsedTransaction, TransactionType } from '@/types';

dayjs.locale('ko');

// ─────────────────────────────────────────
// 자연어 → 거래 파싱 (MVP 룰 기반)
// ─────────────────────────────────────────

// 금액 파싱 (1만5천, 15000, 15,000, 150만원 등)
function parseAmount(text: string): number | null {
  // 1억 단위
  const eok = text.match(/(\d+(?:\.\d+)?)억/);
  if (eok) return Math.round(parseFloat(eok[1]) * 100_000_000);

  // X만 Y천 형태 (e.g. 1만5천, 1만5천원)
  const manCheon = text.match(/(\d+)만\s*(\d+)천/);
  if (manCheon) {
    return parseInt(manCheon[1]) * 10000 + parseInt(manCheon[2]) * 1000;
  }

  // X만원 형태
  const man = text.match(/(\d+(?:\.\d+)?)만\s*원?/);
  if (man) return Math.round(parseFloat(man[1]) * 10000);

  // X천원 형태
  const cheon = text.match(/(\d+)천\s*원?/);
  if (cheon) return parseInt(cheon[1]) * 1000;

  // 숫자 + 원 (콤마 포함) — \d+ 를 먼저 써서 4500 같은 숫자 전체를 매칭
  const plain = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*원?/);
  if (plain) return parseInt(plain[1].replace(/,/g, ''));

  return null;
}

// 날짜 파싱
function parseDate(text: string): string {
  const today = dayjs();

  if (text.includes('그제')) return today.subtract(2, 'day').format('YYYY-MM-DD');
  if (text.includes('어제')) return today.subtract(1, 'day').format('YYYY-MM-DD');
  if (text.includes('오늘') || text.includes('방금') || text.includes('지금')) {
    return today.format('YYYY-MM-DD');
  }

  // "3일 전"
  const daysAgo = text.match(/(\d+)일\s*전/);
  if (daysAgo) return today.subtract(parseInt(daysAgo[1]), 'day').format('YYYY-MM-DD');

  // "4월 12일" 형태
  const mdMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
  if (mdMatch) {
    return today
      .month(parseInt(mdMatch[1]) - 1)
      .date(parseInt(mdMatch[2]))
      .format('YYYY-MM-DD');
  }

  return today.format('YYYY-MM-DD');
}

// 결제수단 힌트 파싱
function parsePaymentHint(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('카카오페이') || lower.includes('카카오 페이')) return '카카오페이';
  if (lower.includes('네이버페이') || lower.includes('네이버 페이')) return '네이버페이';
  if (lower.includes('토스')) return '토스';
  if (lower.includes('신용카드') || lower.includes('신카')) return '신용카드';
  if (lower.includes('체크카드') || lower.includes('체크')) return '체크카드';
  if (lower.includes('현금')) return '현금';
  if (lower.includes('카드')) return '카드';
  if (lower.includes('계좌이체') || lower.includes('이체')) return '계좌이체';
  return '';
}

// 이동 여부 감지 (transfer)
function detectTransfer(text: string): { is_transfer: boolean; from: string; to: string } {
  const transferKeywords = ['충전', '이동', '이체', '송금', '넣기', '넣었', '보냄', '보냈'];
  const hasKeyword = transferKeywords.some((k) => text.includes(k));

  if (!hasKeyword) return { is_transfer: false, from: '', to: '' };

  // "A에서 B로" 패턴
  const fromTo = text.match(/(.+?)에서\s+(.+?)(?:로|으로|에)/);
  if (fromTo) {
    return { is_transfer: true, from: fromTo[1].trim(), to: fromTo[2].trim() };
  }

  // "카카오페이 충전" 패턴
  if (text.includes('충전')) {
    const target = text.split('충전')[0].trim().split(/\s+/).pop() ?? '';
    return { is_transfer: true, from: '', to: target };
  }

  return { is_transfer: true, from: '', to: '' };
}

// 거래 유형 감지
function detectType(text: string, isTransfer: boolean): TransactionType {
  if (isTransfer) return 'transfer';

  const incomeKeywords = ['월급', '급여', '용돈', '수입', '입금', '환급', '부수입', '알바'];
  if (incomeKeywords.some((k) => text.includes(k))) return 'income';

  const fixedKeywords = ['보험', '통신비', '관리비', '월세', '구독', '정기', '자동이체', '넷플릭스', '유튜브프리미엄'];
  if (fixedKeywords.some((k) => text.includes(k))) return 'fixed_expense';

  const tripIncomeKeywords = ['출장비', '출장수당', '출장비지급', '출장비수령'];
  if (tripIncomeKeywords.some((k) => text.includes(k))) return 'income';

  return 'variable_expense';
}

// 카테고리 자동 추론
const MERCHANT_CATEGORY_MAP: Array<{
  keywords: string[];
  main: string;
  sub: string;
}> = [
  { keywords: ['스타벅스', '커피빈', '투썸플레이스', '투썸', '이디야', '폴바셋', '블루보틀', '빽다방', '메가커피', '컴포즈', '카페', '커피', '아메리카노', '라떼', '카푸치노', '마끼아또'], main: '카페', sub: '커피' },
  { keywords: ['맥도날드', '버거킹', '롯데리아', '서브웨이', '쉐이크쉑', '노브랜드버거'], main: '식비', sub: '외식' },
  { keywords: ['배달의민족', '배민', '요기요', '쿠팡이츠', '배달'], main: '식비', sub: '배달' },
  { keywords: ['이마트', '홈플러스', '롯데마트', '코스트코', '마트', '슈퍼', '편의점', 'GS25', 'CU', '세븐일레븐'], main: '식비', sub: '장보기' },
  { keywords: ['지하철', '버스', 'T머니', '교통카드', '택시', '카카오택시', '우티'], main: '교통', sub: '대중교통' },
  { keywords: ['주유', '주유소', 'GS칼텍스', 'SK에너지', '현대오일뱅크'], main: '교통', sub: '주유' },
  { keywords: ['병원', '의원', '약국', '치과', '한의원'], main: '의료', sub: '병원' },
  { keywords: ['쿠팡', '네이버쇼핑', '11번가', 'G마켓', '옥션', '위메프', '티몬', '인터파크'], main: '쇼핑', sub: '생활용품' },
  { keywords: ['다이소'], main: '생활', sub: '소모품' },
  { keywords: ['넷플릭스', '유튜브', '왓챠', '티빙', '웨이브', '스포티파이', '애플뮤직'], main: '고정비', sub: '구독료' },
  { keywords: ['통신비', 'SKT', 'KT', 'LGU+', '알뜰폰'], main: '고정비', sub: '통신비' },
  { keywords: ['보험', '삼성생명', '한화생명', '교보생명', '실비'], main: '고정비', sub: '보험료' },
  { keywords: ['월급', '급여'], main: '수입', sub: '' },
  { keywords: ['출장비', '출장수당', '출장비지급', '출장비수령'], main: '출장', sub: '출장비수령' },
  { keywords: ['출장'], main: '출장', sub: '기타' },
];

function inferCategory(text: string): { main: string; sub: string } {
  for (const entry of MERCHANT_CATEGORY_MAP) {
    if (entry.keywords.some((k) => text.includes(k))) {
      return { main: entry.main, sub: entry.sub };
    }
  }
  return { main: '', sub: '' };
}

// 가맹점명 추출 (금액, 결제수단, 날짜 제거 후 남은 텍스트)
function extractMerchant(text: string): string {
  let clean = text
    .replace(/(\d+(?:\.\d+)?억|\d+만\s*\d+천|\d+만|\d+천|\d{1,3}(?:,\d{3})*)\s*원?/g, '')
    .replace(/카카오페이|네이버페이|토스|신용카드|체크카드|체크|현금|카드|계좌이체|이체/g, '')
    .replace(/오늘|어제|그제|\d+일\s*전|\d{1,2}월\s*\d{1,2}일/g, '')
    .replace(/에서|으로|로|에|를|을|이|가|은|는|했|함|함\.|했음/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 남은 가장 긴 단어를 가맹점으로
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  return words[0] ?? '';
}

// ─────────────────────────────────────────
// 메인 파서
// ─────────────────────────────────────────
export function parseTransactionText(text: string): ParsedTransaction {
  const { is_transfer, from, to } = detectTransfer(text);
  const type = detectType(text, is_transfer);
  const amount = parseAmount(text);
  const date = parseDate(text);
  const paymentHint = parsePaymentHint(text);
  const extracted = extractMerchant(text);
  const { main: categoryMain, sub: categorySub } = inferCategory(text);

  // "에서/from"이 있으면 가맹점, 없으면 구매항목으로 간주
  // 예: "스타벅스에서 커피 5000원" → merchant="스타벅스", name="커피" 가 이상적이나
  //     현재 파서는 단어 1개만 추출하므로 보수적으로 처리:
  //   - "에서" 키워드 있을 때만 merchant_name으로
  //   - 그 외엔 name(구매항목)에만 채우고 merchant_name은 빈값으로 둠 (사용자 입력 유도)
  const hasMerchantHint = /에서|매장|가게|점\s*$/.test(text);
  const merchant = hasMerchantHint ? extracted : '';
  const itemName = is_transfer
    ? `${from || '?'} → ${to || '?'}`
    : extracted || text.slice(0, 20);

  const confidence: ParsedTransaction['confidence'] =
    amount !== null && (extracted || is_transfer) ? 'high' : amount !== null ? 'medium' : 'low';

  return {
    amount,
    merchant_name: merchant,
    name: itemName,
    type,
    category_main: categoryMain,
    category_sub: categorySub,
    payment_method_hint: paymentHint,
    date,
    memo: '',
    is_transfer,
    transfer_from_hint: from,
    transfer_to_hint: to,
    confidence,
  };
}

// 금액 포맷 유틸
export function formatAmount(amount: number): string {
  return amount.toLocaleString('ko-KR') + '원';
}

// 날짜 포맷 유틸
export function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('MM월 DD일 (ddd)');
}

export function formatDateShort(dateStr: string): string {
  return dayjs(dateStr).format('MM/DD');
}

export function isToday(dateStr: string): boolean {
  return dayjs(dateStr).isSame(dayjs(), 'day');
}

export function isYesterday(dateStr: string): boolean {
  return dayjs(dateStr).isSame(dayjs().subtract(1, 'day'), 'day');
}
