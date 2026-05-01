-- 주식 거래에 수수료(fee) 및 세금(tax) 추가
-- 매수 시: fee 만 사용 (수수료)
-- 매도 시: fee + tax 사용 (수수료 + 거래세)

ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS fee NUMERIC NOT NULL DEFAULT 0 CHECK (fee >= 0);

ALTER TABLE stock_transactions
  ADD COLUMN IF NOT EXISTS tax NUMERIC NOT NULL DEFAULT 0 CHECK (tax >= 0);

-- paper(모의투자)에도 동일 컬럼 (있으면 영향 없음)
ALTER TABLE paper_transactions
  ADD COLUMN IF NOT EXISTS fee NUMERIC NOT NULL DEFAULT 0 CHECK (fee >= 0);

ALTER TABLE paper_transactions
  ADD COLUMN IF NOT EXISTS tax NUMERIC NOT NULL DEFAULT 0 CHECK (tax >= 0);
