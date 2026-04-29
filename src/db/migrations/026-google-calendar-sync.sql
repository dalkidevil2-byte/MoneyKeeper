-- 구글 캘린더 연동: household 단위 OAuth refresh token 보관 + 매핑
CREATE TABLE IF NOT EXISTS google_calendar_sync (
  household_id UUID PRIMARY KEY,
  google_email TEXT,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- task ↔ google event 매핑
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tasks_google_event_id ON tasks(google_event_id) WHERE google_event_id IS NOT NULL;
