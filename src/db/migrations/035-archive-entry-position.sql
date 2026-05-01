-- 아카이브 항목(entry) 에 사용자 지정 순서(position) 추가
ALTER TABLE archive_entries
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- 컬렉션 내 정렬 가속용 인덱스
CREATE INDEX IF NOT EXISTS idx_archive_entries_collection_position
  ON archive_entries(collection_id, position, created_at DESC);
