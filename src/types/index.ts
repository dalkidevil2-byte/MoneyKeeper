// ============================================================
// 💰 MoneyKeeper - 공통 TypeScript 타입 정의
// ============================================================

// ─────────────────────────────────────────
// 거래 유형
// ─────────────────────────────────────────
export type TransactionType =
  | 'income'
  | 'fixed_expense'
  | 'variable_expense'
  | 'transfer'
  | 'refund'
  | 'adjustment';

export type TransactionStatus = 'draft' | 'reviewed' | 'confirmed' | 'cancelled';
export type InputType = 'text' | 'voice' | 'receipt' | 'manual';
export type SyncStatus = 'pending' | 'synced' | 'failed' | 'skipped';

// ─────────────────────────────────────────
// 계좌 타입
// ─────────────────────────────────────────
export type AccountType = 'bank' | 'cash' | 'easy_pay_balance' | 'investment' | 'virtual_balance';

// ─────────────────────────────────────────
// 결제수단 타입
// ─────────────────────────────────────────
export type PaymentMethodType = 'debit_card' | 'credit_card' | 'easy_pay' | 'cash' | 'bank_transfer';

// ─────────────────────────────────────────
// 역할
// ─────────────────────────────────────────
export type MemberRole = 'admin' | 'member';

// ─────────────────────────────────────────
// DB 엔티티 타입
// ─────────────────────────────────────────
export interface Household {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: string;
  household_id: string;
  name: string;
  role: MemberRole;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  household_id: string;
  member_id: string | null;
  name: string;
  type: AccountType;
  balance: number;
  is_budget_account: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  household_id: string;
  member_id: string | null;
  name: string;
  type: PaymentMethodType;
  linked_account_id: string | null;
  billing_account_id: string | null;
  billing_day: number | null;
  is_budget_card: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // 조인 데이터
  linked_account?: Account;
  billing_account?: Account;
}

export interface Transaction {
  id: string;
  household_id: string;
  member_id: string | null;
  date: string;
  type: TransactionType;
  amount: number;
  name: string;
  merchant_name: string;
  account_from_id: string | null;
  account_to_id: string | null;
  payment_method_id: string | null;
  category_main: string;
  category_sub: string;
  status: TransactionStatus;
  input_type: InputType;
  memo: string;
  tags: string[];
  essential: boolean;
  notion_page_id: string;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  raw_input: string;
  created_at: string;
  updated_at: string;
  target_member_id: string | null;
  receipt_url: string;
  // 조인 데이터
  member?: Member;
  target_member?: Member;
  account_from?: Account;
  account_to?: Account;
  payment_method?: PaymentMethod;
}

export interface FixedExpenseTemplate {
  id: string;
  household_id: string;
  name: string;
  amount: number;
  due_day: number;
  category_main: string;
  category_sub: string;
  payment_method_id: string | null;
  is_active: boolean;
  created_at: string;
  // 조인
  payment_method?: PaymentMethod;
}

export interface Budget {
  id: string;
  household_id: string;
  name: string;
  period_type: 'monthly';
  start_date: string;
  end_date: string;
  amount: number;
  account_id: string | null;
  payment_method_id: string | null;
  warning_80: boolean;
  warning_90: boolean;
  warning_100: boolean;
  created_at: string;
  updated_at: string;
  // 계산 필드 (API 응답에 포함)
  used_amount?: number;
  usage_rate?: number;
}

// ─────────────────────────────────────────
// 자연어 파싱 결과 타입
// ─────────────────────────────────────────
export interface ParsedTransaction {
  amount: number | null;
  merchant_name: string;
  name: string;
  type: TransactionType;
  category_main: string;
  category_sub: string;
  payment_method_hint: string;   // 카드, 현금, 카카오페이 등 텍스트
  date: string;                  // YYYY-MM-DD
  memo: string;
  is_transfer: boolean;
  transfer_from_hint: string;    // "생활비통장" 등
  transfer_to_hint: string;      // "카카오페이" 등
  confidence: 'high' | 'medium' | 'low';
}

// ─────────────────────────────────────────
// API 요청/응답 타입
// ─────────────────────────────────────────
export interface CreateTransactionInput {
  household_id: string;
  member_id?: string;
  target_member_id?: string;
  receipt_url?: string;
  date: string;
  type: TransactionType;
  amount: number;
  name: string;
  merchant_name?: string;
  account_from_id?: string;
  account_to_id?: string;
  payment_method_id?: string;
  category_main?: string;
  category_sub?: string;
  memo?: string;
  tags?: string[];
  essential?: boolean;
  input_type?: InputType;
  raw_input?: string;
}

export interface ParseTextInput {
  text: string;
  household_id: string;
}

export interface BudgetWithUsage extends Budget {
  used_amount: number;
  usage_rate: number;
  warning_level: 'none' | 'warning_80' | 'warning_90' | 'warning_100';
  projected_overage: boolean;   // 소비 속도 기준 월말 초과 예상 여부
}

// ─────────────────────────────────────────
// 카테고리
// ─────────────────────────────────────────
export const CATEGORY_MAIN_OPTIONS = [
  '수입', '고정비', '식비', '카페', '생활', '교통', '쇼핑',
  '의료', '교육', '취미', '육아', '주거', '저축/투자', '출장', '기타'
] as const;

export type CategoryMain = typeof CATEGORY_MAIN_OPTIONS[number];

export const CATEGORY_SUB_MAP: Record<string, string[]> = {
  '식비':  ['장보기', '식재료', '외식', '간식', '배달'],
  '카페':  ['커피', '음료', '디저트', '베이커리'],
  '생활':  ['세제', '욕실용품', '청소용품', '소모품'],
  '쇼핑':  ['의류', '잡화', '전자제품', '생활용품'],
  '교통':  ['대중교통', '주유', '주차', '택시'],
  '의료':  ['병원', '약국', '건강식품'],
  '교육':  ['학원', '도서', '온라인강의'],
  '취미':  ['OTT구독', '게임', '스포츠', '문화생활'],
  '고정비': ['통신비', '보험료', '관리비', '월세', '구독료'],
  '주거':  ['인테리어', '가전', '가구'],
  '저축/투자': ['적금', '주식', '펀드', '코인'],
  '육아':  ['분유/기저귀', '장난감', '육아용품', '교육비'],
  '출장':  ['출장비수령', '숙박', '식비', '교통', '기타'],
};

// 거래 유형 한글 매핑
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: '수입',
  fixed_expense: '고정지출',
  variable_expense: '변동지출',
  transfer: '자금이동',
  refund: '환불',
  adjustment: '조정',
};

// 거래 유형 색상
export const TRANSACTION_TYPE_COLORS: Record<TransactionType, string> = {
  income: 'text-emerald-600',
  fixed_expense: 'text-orange-500',
  variable_expense: 'text-rose-500',
  transfer: 'text-blue-500',
  refund: 'text-purple-500',
  adjustment: 'text-gray-400',
};

// 계좌 타입 한글
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: '은행',
  cash: '현금',
  easy_pay_balance: '간편결제',
  investment: '투자',
  virtual_balance: '가상',
};

// 결제수단 타입 한글
export const PAYMENT_METHOD_TYPE_LABELS: Record<PaymentMethodType, string> = {
  debit_card: '체크카드',
  credit_card: '신용카드',
  easy_pay: '간편결제',
  cash: '현금',
  bank_transfer: '계좌이체',
};
