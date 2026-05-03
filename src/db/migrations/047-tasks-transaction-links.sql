-- 할일 ↔ 가계부 거래 연결 (M:N relation)
-- 형식: [{ "transaction_id": "uuid" }, ...]
-- 기존 expense_transaction_id (1:1) 는 deprecated — 호환 위해 남겨둠
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS transaction_links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- transactions → tasks 역방향 조회 가속용 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_tasks_transaction_links_gin
  ON tasks USING GIN (transaction_links);
