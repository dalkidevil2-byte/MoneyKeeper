-- 013: 인앱 알림 설정 (lead_minutes 배열)
-- 예: [10, 30] 이면 10분/30분 전 알림

CREATE TABLE IF NOT EXISTS todo_notification_settings (
  household_id UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  lead_minutes INTEGER[] NOT NULL DEFAULT '{30}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
