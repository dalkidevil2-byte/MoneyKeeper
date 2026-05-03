-- 일정/할일 다중 알림
-- reminders: [{ "min": 1440 }, { "min": 60 }, { "min": 0 }] — 분 전 (0=정시)
-- sent_reminders: [{ "min": 60, "for_date": "2026-05-04" }] — 중복 방지
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS reminders JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sent_reminders JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 활성 알림 빠른 검색
CREATE INDEX IF NOT EXISTS idx_tasks_reminders_active
  ON tasks(household_id, due_date)
  WHERE reminders IS NOT NULL
    AND reminders <> '[]'::jsonb
    AND status != 'cancelled'
    AND is_active = true;
