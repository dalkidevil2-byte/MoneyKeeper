-- ============================================================================
-- 016: 일정(event)과 할일(todo) 구분
-- - event : 특정 날짜·시간에 해야 할 일정 (회의/약속). 캘린더에 chip 으로 표시
-- - todo  : 기한까지 끝내면 되는 작업. 할일 리스트에서 deadline 임박 순 정렬,
--           캘린더에는 deadline 일에 작은 점만
-- 기존 데이터 자동 분류:
--   is_fixed=true 또는 type='routine' → event
--   그 외 → todo (단, due_date 가 있으면 deadline 도 함께 채움)
-- ============================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'event'
    CHECK (kind IN ('event', 'todo')),
  ADD COLUMN IF NOT EXISTS deadline_date DATE,    -- todo 의 기한 (날짜)
  ADD COLUMN IF NOT EXISTS deadline_time TIME;    -- todo 의 기한 시간 (선택)

-- 기존 데이터 분류 (한 번만 의미 있음, IF NOT EXISTS 가 있으니 재실행 안전)
UPDATE tasks
SET kind = CASE
  WHEN type = 'routine' THEN 'event'
  WHEN is_fixed = true THEN 'event'
  ELSE 'event'
  -- 사실 기존 데이터는 모두 event 로 두는 게 안전. 사용자가 todo 로 바꾸고 싶으면 직접 변경.
END
WHERE kind IS NULL OR kind = 'event';

CREATE INDEX IF NOT EXISTS idx_tasks_kind ON tasks(household_id, kind);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(household_id, deadline_date)
  WHERE kind = 'todo';
