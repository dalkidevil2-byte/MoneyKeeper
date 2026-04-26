-- ============================================================================
-- 007 마이그레이션: tasks 에 종료일/종료시간 컬럼 추가 (기간 일정)
-- due_date    = 시작일
-- end_date    = 종료일 (NULL 이면 단일 날짜)
-- due_time    = 시작시간 (is_fixed=true 일 때만 사용, 기존 그대로)
-- end_time    = 종료시간 (is_fixed=true 일 때만 사용)
-- is_fixed    = 시간 지정 여부 (true=시간 있음, false=종일)
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS end_time TIME;
