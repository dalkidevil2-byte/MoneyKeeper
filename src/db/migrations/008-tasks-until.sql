-- ============================================================================
-- 008 마이그레이션: 반복 일정 종료 조건
--   until_date  : 이 날짜까지만 반복 (포함)
--   until_count : 총 N회까지만 반복 (완료 횟수 기준)
-- 둘 다 NULL 이면 무한 반복.
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS until_date  DATE,
  ADD COLUMN IF NOT EXISTS until_count INTEGER;
