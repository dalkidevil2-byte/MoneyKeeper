-- 할일 ↔ 아카이브 컬렉션 항목 연결 (양방향 relation)
-- 형식: [{ "collection_id": "uuid", "entry_id": "uuid" }, ...]
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS archive_links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- archive_entries → tasks 역방향 조회 가속용 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_tasks_archive_links_gin
  ON tasks USING GIN (archive_links);
