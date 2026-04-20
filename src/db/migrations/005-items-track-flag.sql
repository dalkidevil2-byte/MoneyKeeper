-- ============================================================================
-- 005 마이그레이션: items.track 플래그
-- 품목 추적은 즐겨찾기처럼 명시적 선택만 반영.
-- 기존 데이터는 모두 OFF로 시작.
-- ============================================================================

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS track BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_items_track_name_unit
  ON items(track, name, unit)
  WHERE track = true;
