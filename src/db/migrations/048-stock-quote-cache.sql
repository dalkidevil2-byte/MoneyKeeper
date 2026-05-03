-- 주식 시세 영구 캐시 — 장 종료 후엔 외부 API 호출 안 하게
-- 장 열린 시간엔 짧은 TTL 로 갱신, 장 닫힌 시간엔 종가 그대로 유지
CREATE TABLE IF NOT EXISTS stock_quote_cache (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  previous_close NUMERIC,
  change_amount NUMERIC,
  change_percent NUMERIC,
  short_name TEXT,
  currency TEXT,
  market_state TEXT,        -- 'OPEN' | 'CLOSED' | 'PRE' | 'POST'
  source TEXT,              -- 'yahoo' | 'naver' | 'naver_nxt'
  -- NXT 가격 (정규장 외 시간 대용)
  nxt_price NUMERIC,
  nxt_change_amount NUMERIC,
  nxt_change_percent NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 마지막 정규장 종가 (날짜와 함께) — AI 평가 fallback 용
  last_close_price NUMERIC,
  last_close_date DATE
);

CREATE INDEX IF NOT EXISTS idx_stock_quote_cache_fetched_at
  ON stock_quote_cache(fetched_at DESC);
