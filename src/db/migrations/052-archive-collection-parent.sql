-- 아카이브 컬렉션을 상/하위로 분류하기 위한 self-reference parent_id.
-- parent_id = NULL → 최상위(카테고리 역할 가능), 값이 있으면 해당 컬렉션의 하위.
-- 컬렉션 삭제 시 자식은 최상위로 승격 (ON DELETE SET NULL).

ALTER TABLE archive_collections
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES archive_collections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_archive_collections_parent
  ON archive_collections(parent_id);
