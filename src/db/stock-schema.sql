-- ============================================================================
-- 📈 My Assistant - 주식 모듈 스키마
-- 전제: schema.sql(households, update_updated_at)이 이미 존재해야 함
-- ============================================================================

-- ─────────────────────────────────────────
-- 1. stock_owners (주식 계좌 소유자)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source_id INTEGER,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_owners_household ON stock_owners(household_id);

-- ─────────────────────────────────────────
-- 2. stock_accounts (증권 계좌)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES stock_owners(id) ON DELETE CASCADE,
  source_id INTEGER,
  broker_name TEXT NOT NULL DEFAULT '',
  account_number TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_accounts_owner ON stock_accounts(owner_id);

-- ─────────────────────────────────────────
-- 3. stock_transactions (매수/매도)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
  source_id INTEGER,
  ticker TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  date DATE NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price >= 0),
  total_amount NUMERIC GENERATED ALWAYS AS (quantity * price) STORED,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_account_date ON stock_transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_ticker ON stock_transactions(ticker);

-- ─────────────────────────────────────────
-- 4. stock_cash_flows (시드머니: 입출금)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_cash_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES stock_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAW')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_cash_flows_account_date
  ON stock_cash_flows(account_id, date DESC);

-- ─────────────────────────────────────────
-- 5. stock_targets (종목별 목표 수익률 %)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  target_pct NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, ticker)
);

-- ─────────────────────────────────────────
-- 6. stock_memos (종목별 메모)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, ticker)
);

-- ─────────────────────────────────────────
-- 7. stock_asset_history (날짜별 총평가액 추이)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_asset_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_value BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, date)
);

-- ─────────────────────────────────────────
-- 8. stock_krx_stocks (KRX 종목 캐시 - 공용)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_krx_stocks (
  code TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KOSPI', 'KOSDAQ')),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_krx_name ON stock_krx_stocks(name);

-- ============================================================================
-- 📊 모의투자 (paper_*) — 실계좌와 완전 분리
-- ============================================================================

CREATE TABLE IF NOT EXISTS paper_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_owners_household ON paper_owners(household_id);

CREATE TABLE IF NOT EXISTS paper_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES paper_owners(id) ON DELETE CASCADE,
  broker_name TEXT NOT NULL DEFAULT '',
  account_number TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_accounts_owner ON paper_accounts(owner_id);

CREATE TABLE IF NOT EXISTS paper_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  date DATE NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price >= 0),
  total_amount NUMERIC GENERATED ALWAYS AS (quantity * price) STORED,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_account_date
  ON paper_transactions(account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_paper_transactions_ticker
  ON paper_transactions(ticker);

CREATE TABLE IF NOT EXISTS paper_cash_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAW')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paper_cash_flows_account_date
  ON paper_cash_flows(account_id, date DESC);

-- ─────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────
CREATE TRIGGER trg_stock_targets_updated_at
  BEFORE UPDATE ON stock_targets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stock_memos_updated_at
  BEFORE UPDATE ON stock_memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_stock_krx_updated_at
  BEFORE UPDATE ON stock_krx_stocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
