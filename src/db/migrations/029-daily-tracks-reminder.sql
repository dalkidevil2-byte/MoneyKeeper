-- Daily Track 알림 시간 (HH:MM 형식)
ALTER TABLE daily_tracks
  ADD COLUMN IF NOT EXISTS reminder_time TEXT;

-- 알림 발송 로그 (같은 날 중복 발송 방지)
CREATE TABLE IF NOT EXISTS daily_track_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  track_id UUID NOT NULL,
  reminder_date DATE NOT NULL,
  member_id UUID,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (track_id, reminder_date, member_id)
);

CREATE INDEX IF NOT EXISTS idx_dt_reminder_log_date
  ON daily_track_reminder_log(reminder_date DESC);
