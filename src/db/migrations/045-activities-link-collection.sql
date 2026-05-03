-- 활동 ↔ 아카이브 컬렉션 매핑 (활동 설정 단계)
-- 이 활동을 시작할 때 어느 컬렉션의 항목을 묻을지
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS link_collection_id UUID
  REFERENCES archive_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_activities_link_collection
  ON activities(link_collection_id) WHERE link_collection_id IS NOT NULL;
