-- ============================================================
-- 💰 AI 가계부 (MoneyKeeper) - Supabase PostgreSQL Schema
-- MVP 1차 구현 기준
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Households (가계 단위)
-- ─────────────────────────────────────────
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. Members (가족 구성원)
-- ─────────────────────────────────────────
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  color TEXT DEFAULT '#6366f1',   -- 구성원 색상 (UI 구분용)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. Accounts (계좌/자산)
-- ─────────────────────────────────────────
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                   -- e.g. "생활비통장", "월급통장"
  type TEXT NOT NULL DEFAULT 'bank'    -- bank | cash | easy_pay_balance | investment | virtual_balance
    CHECK (type IN ('bank', 'cash', 'easy_pay_balance', 'investment', 'virtual_balance')),
  balance BIGINT DEFAULT 0,             -- 단위: 원 (정수)
  is_budget_account BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 4. Payment Methods (결제수단)
-- ─────────────────────────────────────────
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                   -- e.g. "신한 생활비 체크카드"
  type TEXT NOT NULL DEFAULT 'debit_card'
    CHECK (type IN ('debit_card', 'credit_card', 'easy_pay', 'cash', 'bank_transfer')),
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,   -- 체크카드/간편결제 연결 계좌
  billing_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,  -- 신용카드 청구 계좌
  billing_day SMALLINT,                  -- 신용카드 결제일 (1~31)
  is_budget_card BOOLEAN DEFAULT false, -- 생활비 전용카드 여부
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. Transactions (거래 내역 - 핵심 테이블)
-- ─────────────────────────────────────────
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,

  -- 날짜
  date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- 거래 유형
  type TEXT NOT NULL DEFAULT 'variable_expense'
    CHECK (type IN ('income', 'fixed_expense', 'variable_expense', 'transfer', 'refund', 'adjustment')),

  -- 금액 (원 단위 정수)
  amount BIGINT NOT NULL CHECK (amount > 0),

  -- 거래명 / 가맹점
  name TEXT NOT NULL DEFAULT '',          -- 거래명 (e.g. "스타벅스 아메리카노")
  merchant_name TEXT DEFAULT '',          -- 가맹점명 (e.g. "스타벅스 강남점")

  -- 계좌 연결
  account_from_id UUID REFERENCES accounts(id) ON DELETE SET NULL,   -- 출금 계좌 (지출/이동)
  account_to_id UUID REFERENCES accounts(id) ON DELETE SET NULL,     -- 입금 계좌 (이동/수입) ← transfer 필수

  -- 결제수단
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,

  -- 카테고리
  category_main TEXT DEFAULT '',   -- e.g. "식비"
  category_sub TEXT DEFAULT '',    -- e.g. "카페"

  -- 상태
  status TEXT NOT NULL DEFAULT 'reviewed'
    CHECK (status IN ('draft', 'reviewed', 'confirmed', 'cancelled')),

  -- 입력 방식
  input_type TEXT NOT NULL DEFAULT 'text'
    CHECK (input_type IN ('text', 'voice', 'receipt', 'manual')),

  -- 부가 정보
  memo TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  essential BOOLEAN DEFAULT false,        -- 필수 소비 여부

  -- Notion 동기화
  notion_page_id TEXT DEFAULT '',
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  last_synced_at TIMESTAMPTZ,

  -- 원본 파싱 텍스트 (텍스트 입력 시 보존)
  raw_input TEXT DEFAULT '',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 6. Budgets (예산)
-- ─────────────────────────────────────────
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '생활비 예산',
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),    -- 예산 총액 (원)
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,           -- 예산 연결 계좌
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL, -- 예산 연결 카드
  -- 경고 임계값 (기본값)
  warning_80 BOOLEAN DEFAULT true,
  warning_90 BOOLEAN DEFAULT true,
  warning_100 BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 7. (구조만) Receipts - 2차 구현 예정
-- ─────────────────────────────────────────
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  image_url TEXT DEFAULT '',
  ocr_raw TEXT DEFAULT '',
  parsed_result_json JSONB DEFAULT '{}',
  total_amount BIGINT,
  merchant_name TEXT DEFAULT '',
  receipt_date DATE,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 8. (구조만) Items - 2차 구현 예정
-- ─────────────────────────────────────────
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT DEFAULT '',
  representative_name TEXT DEFAULT '',
  price BIGINT NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price BIGINT GENERATED ALWAYS AS (price / GREATEST(quantity, 1)) STORED,
  category_main TEXT DEFAULT '',
  category_sub TEXT DEFAULT '',
  essential BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 인덱스
-- ─────────────────────────────────────────
CREATE INDEX idx_transactions_household_date ON transactions(household_id, date DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_sync_status ON transactions(sync_status);
CREATE INDEX idx_transactions_member ON transactions(member_id);
CREATE INDEX idx_budgets_household ON budgets(household_id);
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_payment_methods_household ON payment_methods(household_id);

-- ─────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_households_updated_at    BEFORE UPDATE ON households    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_members_updated_at       BEFORE UPDATE ON members       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_accounts_updated_at      BEFORE UPDATE ON accounts      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated_at  BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budgets_updated_at       BEFORE UPDATE ON budgets       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_receipts_updated_at      BEFORE UPDATE ON receipts      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_items_updated_at         BEFORE UPDATE ON items         FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- 시드 데이터 (개발용 기본값)
-- ─────────────────────────────────────────
-- 기본 가계 생성
INSERT INTO households (id, name) VALUES ('00000000-0000-0000-0000-000000000001', '우리집 가계부');

-- 기본 구성원
INSERT INTO members (household_id, name, role, color) VALUES
  ('00000000-0000-0000-0000-000000000001', '나', 'admin', '#6366f1'),
  ('00000000-0000-0000-0000-000000000001', '배우자', 'member', '#ec4899');

-- 기본 계좌
INSERT INTO accounts (household_id, name, type, balance, is_budget_account) VALUES
  ('00000000-0000-0000-0000-000000000001', '월급통장', 'bank', 3000000, false),
  ('00000000-0000-0000-0000-000000000001', '생활비통장', 'bank', 500000, true),
  ('00000000-0000-0000-0000-000000000001', '카카오페이', 'easy_pay_balance', 50000, false),
  ('00000000-0000-0000-0000-000000000001', '현금', 'cash', 100000, false);

-- ─────────────────────────────────────────
-- 잔액 업데이트 RPC 함수 (트랜잭션 안전)
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_balance(account_id UUID, amount BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE accounts SET balance = balance + amount WHERE id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_balance(account_id UUID, amount BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
