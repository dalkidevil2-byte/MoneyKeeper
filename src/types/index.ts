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
  telegram_chat_id?: string;
  telegram_username?: string;
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
  target_member_ids: string[] | null;
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
  target_member_ids?: string[];
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

// ─────────────────────────────────────────
// TODO 모듈 타입
// ─────────────────────────────────────────
export type TaskKind = 'event' | 'todo';
export type TaskType = 'one_time' | 'routine';
export type TaskStatus = 'pending' | 'done' | 'snoozed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high';

export type RecurrenceRule =
  | { freq: 'daily' }
  | { freq: 'weekly'; weekdays: number[] }            // 0=일, 6=토
  | { freq: 'monthly'; lunar?: boolean }              // 매월 (시작일의 일자), lunar=true면 음력 기준
  | { freq: 'yearly'; lunar?: boolean }               // 매년 (시작일의 월/일), lunar=true면 음력 기준
  | { freq: 'interval'; every_days: number }          // N일마다
  | { freq: 'count_per_period'; count: number; period: 'week' | 'month' };

export interface Task {
  id: string;
  household_id: string;
  kind: TaskKind;
  /** kind='todo' 일 때 시작일 (이 날부터 리스트 노출) */
  start_date: string | null;
  /** kind='todo' 일 때 시작 시간 (선택) — 시작일이 도래해도 이 시간 이후부터 노출 */
  start_time: string | null;
  /** kind='todo' 일 때 기한일 (event 는 due_date 그대로 사용) */
  deadline_date: string | null;
  deadline_time: string | null;
  type: TaskType;
  title: string;
  memo: string;
  category_main: string;
  category_sub: string;
  member_id: string | null;
  target_member_ids: string[];
  is_fixed: boolean;            // true=시간 지정, false=종일
  due_date: string | null;      // 시작일
  end_date: string | null;      // 종료일 (NULL=단일 일자)
  due_time: string | null;      // 시작시간 (is_fixed=true 일 때)
  end_time: string | null;      // 종료시간 (is_fixed=true 일 때)
  status: TaskStatus;
  snoozed_to: string | null;
  completed_at: string | null;
  priority: TaskPriority;
  recurrence: RecurrenceRule | null;
  until_date: string | null;       // 반복 종료일 (포함). 루틴 전용.
  until_count: number | null;      // 반복 총 횟수 제한. 루틴 전용.
  excluded_dates: string[];        // 건너뛸 날짜들 (YYYY-MM-DD). 루틴 전용.
  source: 'manual' | 'notion';
  source_external_id: string | null;
  notion_last_edited_time: string | null;
  goal_id: string | null;
  expense_amount: number | null;
  expense_category_main: string | null;
  expense_category_sub: string | null;
  expense_account_id: string | null;
  expense_payment_method_id: string | null;
  expense_transaction_id: string | null;
  /** 할일 자체의 예상 소요시간 (분) — 계획 단계에서 입력. 실제 합산(session_total_minutes)와 비교 */
  estimated_minutes?: number | null;
  /** 구글 캘린더 동기화 — 매핑된 이벤트 ID */
  google_event_id?: string | null;
  google_calendar_id?: string | null;
  google_synced_at?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // 조인 데이터
  member?: Member;
  completions?: TaskCompletion[];
  checklist?: TaskChecklistItem[];
  /** 리스트 응답에서 체크리스트 진행률 요약 + 예상 분 합 */
  checklist_summary?: { total: number; done: number; total_minutes: number } | null;
  /** 리스트 응답에서 작업 세션 합산 분 */
  session_total_minutes?: number;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  household_id: string;
  title: string;
  is_done: boolean;
  done_at: string | null;
  position: number;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
}

/** 할일(todo) 의 작업 세션 — 실제로 일하기로 잡은 시간 슬롯 */
export interface TaskWorkSession {
  id: string;
  task_id: string;
  household_id: string;
  session_date: string;          // YYYY-MM-DD
  start_time: string | null;     // HH:MM:SS  (null = 종일)
  end_time: string | null;
  is_done: boolean;
  done_at: string | null;
  note: string;
  expense_amount: number | null;
  expense_category_main: string | null;
  expense_category_sub: string | null;
  expense_account_id: string | null;
  expense_payment_method_id: string | null;
  expense_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  // 카드 표시용
  task_title?: string;
  task_color?: string;
  member?: Member;
}

export interface TaskCompletion {
  id: string;
  task_id: string;
  household_id: string;
  completed_on: string;
  completed_at: string;
  member_id: string | null;
  note: string;
}

export interface CreateTaskInput {
  household_id: string;
  kind?: TaskKind;
  start_date?: string | null;
  start_time?: string | null;
  deadline_date?: string | null;
  deadline_time?: string | null;
  type: TaskType;
  title: string;
  memo?: string;
  category_main?: string;
  category_sub?: string;
  member_id?: string | null;
  target_member_ids?: string[];
  is_fixed?: boolean;
  due_date?: string | null;
  end_date?: string | null;
  due_time?: string | null;
  end_time?: string | null;
  priority?: TaskPriority;
  recurrence?: RecurrenceRule | null;
  until_date?: string | null;
  until_count?: number | null;
  goal_id?: string | null;
  expense_amount?: number | null;
  expense_category_main?: string | null;
  expense_category_sub?: string | null;
  expense_account_id?: string | null;
  expense_payment_method_id?: string | null;
  estimated_minutes?: number | null;
}

// 오늘의 할일 통합 응답 (one_time + routine 인스턴스)
export interface TodayTask {
  task: Task;
  // routine의 경우 표시 기준일 (= 오늘) — one_time은 due_date와 동일
  occurrence_date: string;
  // routine의 경우 오늘 완료 여부, one_time은 status==='done'
  completed_today: boolean;
  // routine completion id (있을 때만)
  completion_id?: string;
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '예정',
  done: '완료',
  snoozed: '미룸',
  cancelled: '취소',
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

// ─────────────────────────────────────────
// Daily Track Record (DTR)
// ─────────────────────────────────────────
export type DailyTrackPeriod = 'day' | 'week' | 'month';

export interface DailyTrack {
  id: string;
  household_id: string;
  title: string;
  emoji: string;
  category_main: string;
  member_id: string | null;
  target_member_ids: string[];
  target_count: number;
  period_unit: DailyTrackPeriod;
  start_date: string | null;
  end_date: string | null;
  weekdays: number[] | null;    // 활성 요일 (0=일, 6=토). null/빈 배열이면 매일
  until_count: number | null;   // 총 N회 완료까지만 (도달 시 자동 비활성)
  reminder_time: string | null; // 알림 시간 HH:MM (체크 안 됐으면 텔레그램 알림)
  goal_id: string | null;       // 연결된 목표 (체크 시 자동 +1)
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
  // 계산 필드
  member?: Member;
  current_count?: number;       // 현재 주기 안의 완료 수
  total_count?: number;         // 누적 총 횟수
  is_done_today?: boolean;      // 주기 목표 달성 (current_count >= target_count)
  done_today?: boolean;          // 오늘 체크된 로그 존재 여부 (취소선 표시 용)
  is_active_today?: boolean;    // 오늘 활성화 (요일/기간/달성 후 숨김 종합)
}

export interface CreateDailyTrackInput {
  household_id?: string;
  title: string;
  emoji?: string;
  category_main?: string;
  member_id?: string | null;
  target_member_ids?: string[];
  target_count?: number;
  period_unit?: DailyTrackPeriod;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
  until_count?: number | null;
  reminder_time?: string | null;
  goal_id?: string | null;
}

export const DAILY_TRACK_PERIOD_LABELS: Record<DailyTrackPeriod, string> = {
  day: '하루',
  week: '주',
  month: '월',
};

// ─────────────────────────────────────────
// 목표 (Goals)
// ─────────────────────────────────────────
export type GoalType = 'frequency' | 'quantitative' | 'deadline';
export type GoalStatus = 'active' | 'paused' | 'achieved' | 'cancelled';

export interface Goal {
  id: string;
  household_id: string;
  type: GoalType;
  title: string;
  memo: string;
  emoji: string;
  category_main: string;
  member_id: string | null;
  target_member_ids: string[];
  freq_count: number | null;
  freq_period: 'day' | 'week' | 'month' | null;
  target_value: number | null;
  unit: string;
  start_date: string | null;
  due_date: string | null;
  status: GoalStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  // 계산 필드
  current_value?: number;
  progress_rate?: number;
  linked_task_count?: number;
  time_total_minutes?: number;
  time_week_minutes?: number;
  time_month_minutes?: number;
  member?: Member;
  // 단건 조회 시
  linked_tasks?: Array<{
    id: string;
    title: string;
    type: 'one_time' | 'routine';
    is_fixed: boolean;
    due_date: string | null;
    due_time: string | null;
    recurrence: RecurrenceRule | null;
    member?: Member;
  }>;
  events?: Array<{
    id: string;
    occurred_on: string;
    delta: number;
    source: string;
    note: string;
  }>;
}

export interface CreateGoalInput {
  household_id?: string;
  type: GoalType;
  title: string;
  memo?: string;
  emoji?: string;
  category_main?: string;
  member_id?: string | null;
  target_member_ids?: string[];
  freq_count?: number | null;
  freq_period?: 'day' | 'week' | 'month' | null;
  target_value?: number | null;
  unit?: string;
  start_date?: string | null;
  due_date?: string | null;
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  frequency: '빈도',
  quantitative: '성취',
  deadline: '마감',
};

// ─────────────────────────────────────────
// 노션 가져오기 소스
// ─────────────────────────────────────────
export interface TodoNotionSource {
  id: string;
  household_id: string;
  name: string;
  database_id: string;
  database_url: string;
  title_property: string;
  date_property: string;
  member_property: string;
  category_property: string;
  filter_property: string;        // 체크박스 속성명 — true 인 행만 가져옴 (빈값=필터 없음)
  last_imported_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────
// 일상 활동 (Activity) — 시간 추적용
// ─────────────────────────────────────────
export interface Activity {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  category: string;
  member_id: string | null;
  is_favorite: boolean;
  is_active: boolean;
  position: number;
  goal_id: string | null;
  daily_track_id: string | null;
  goal_count_mode: 'session' | 'hours';
  created_at: string;
  updated_at: string;
  // 계산 필드
  running_session?: ActivitySession | null;
  today_minutes?: number;
  week_minutes?: number;
  recent_count?: number; // 최근 30일 세션 수 (자주 쓰는 거 정렬용)
}

export interface ActivitySession {
  id: string;
  household_id: string;
  activity_id: string;
  member_id: string | null;
  session_date: string;
  start_at: string;     // ISO
  end_at: string | null; // null = 진행 중
  duration_minutes: number | null;
  note: string;
  created_at: string;
}

// ─────────────────────────────────────────
// 아카이브 — 사용자 정의 컬렉션 (노션-lite)
// ─────────────────────────────────────────
export type ArchivePropertyType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'date'
  | 'url'
  | 'select'
  | 'multiselect'
  | 'rating'
  | 'checkbox'
  | 'currency'  // 금액
  | 'member'
  | 'files'    // 첨부파일/이미지 (배열로 URL 저장)
  | 'checklist'; // 체크리스트 — [{ label, done, note? }] 배열

export interface ArchiveProperty {
  key: string;          // 내부 key (영문 권장)
  label: string;        // 표시 이름
  type: ArchivePropertyType;
  options?: string[];   // select / multiselect
  required?: boolean;
}

export interface ArchiveCollection {
  id: string;
  household_id: string;
  name: string;
  emoji: string;
  color: string;
  description: string;
  schema: ArchiveProperty[];
  is_active: boolean;
  position: number;
  // 카드 레이아웃 — 'list' (텍스트만) | 'gallery' (사진 표지)
  card_layout?: 'list' | 'gallery';
  created_at: string;
  updated_at: string;
  // 계산 필드
  entry_count?: number;
}

export interface ArchiveEntry {
  id: string;
  collection_id: string;
  household_id: string;
  data: Record<string, unknown>;
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateActivityInput {
  household_id?: string;
  name: string;
  emoji?: string;
  color?: string;
  category?: string;
  member_id?: string | null;
  is_favorite?: boolean;
  goal_id?: string | null;
  daily_track_id?: string | null;
  goal_count_mode?: 'session' | 'hours';
}
