-- ============================================================================
-- 002 마이그레이션: 관심종목/저널 제거 + 시드머니 + 모의투자 분리
-- 적용:
--   psql 또는 Supabase SQL Editor에서 이 파일 실행
-- ============================================================================

-- ─── 관심종목 / 저널 제거 ───────────────────────────────────────
DROP TRIGGER IF EXISTS trg_stock_journals_updated_at ON stock_journals;
DROP TABLE IF EXISTS stock_journals;
DROP TABLE IF EXISTS stock_watchlist;

-- ─── 시드머니 (계좌별 입출금) ───────────────────────────────────
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

-- ─── 모의투자: 별도 테이블 (paper_*) ────────────────────────────
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
