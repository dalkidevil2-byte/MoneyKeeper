-- 아카이브 — 사용자 정의 컬렉션 + 동적 스키마 (노션-lite)
CREATE TABLE IF NOT EXISTS archive_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  -- schema = [{ key, label, type, options?, required? }]
  schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archive_collections_household
  ON archive_collections(household_id, is_active);

-- 항목 (entry) — data 는 schema 의 key→value 매핑 JSON
CREATE TABLE IF NOT EXISTS archive_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES archive_collections(id) ON DELETE CASCADE,
  household_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  member_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archive_entries_collection
  ON archive_entries(collection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_entries_household
  ON archive_entries(household_id);
