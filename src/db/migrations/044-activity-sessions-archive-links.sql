-- 활동 세션 ↔ 아카이브 연결
ALTER TABLE activity_sessions
  ADD COLUMN IF NOT EXISTS archive_links JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_activity_sessions_archive_links_gin
  ON activity_sessions USING GIN (archive_links);
