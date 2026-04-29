-- 보조 캘린더 추적: 각 task 가 어느 구글 캘린더 소속인지
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
