-- 보유종목 즐겨찾기 (별표) — household 단위로 ticker 저장
CREATE TABLE IF NOT EXISTS stock_favorites (
  household_id UUID NOT NULL,
  ticker TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_stock_favorites_household ON stock_favorites(household_id);
