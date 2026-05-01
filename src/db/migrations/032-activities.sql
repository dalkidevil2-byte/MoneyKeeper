-- 일상 활동 추적 (Activity) — ▶/■ 로 시간 누적 + 목표/Daily Track 자동 연동
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '⏱',
  color TEXT DEFAULT '#6366f1',
  category TEXT DEFAULT '',
  member_id UUID,
  is_favorite BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  -- 자동 연동 (선택)
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  daily_track_id UUID REFERENCES daily_tracks(id) ON DELETE SET NULL,
  goal_count_mode TEXT NOT NULL DEFAULT 'session'
    CHECK (goal_count_mode IN ('session', 'hours')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_household_active
  ON activities(household_id, is_active);

-- 활동 세션 (시작/종료 1쌍)
CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  member_id UUID,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  note TEXT DEFAULT '',
  -- 진행 이벤트 cascade 위해
  goal_progress_event_id UUID REFERENCES goal_progress_events(id) ON DELETE SET NULL,
  daily_track_log_id UUID REFERENCES daily_track_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_sessions_activity_date
  ON activity_sessions(activity_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_household_date
  ON activity_sessions(household_id, session_date DESC);

-- 진행 중 세션 (end_at IS NULL) 은 활동당 1개만
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_sessions_one_running
  ON activity_sessions(activity_id) WHERE end_at IS NULL;

-- duration 자동 계산 trigger
CREATE OR REPLACE FUNCTION compute_activity_session_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_at IS NOT NULL AND NEW.start_at IS NOT NULL THEN
    NEW.duration_minutes := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NEW.end_at - NEW.start_at)) / 60))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_session_duration ON activity_sessions;
CREATE TRIGGER trg_activity_session_duration
  BEFORE INSERT OR UPDATE ON activity_sessions
  FOR EACH ROW EXECUTE FUNCTION compute_activity_session_duration();

-- goal_progress_events.source 에 'activity_session' 추가
ALTER TABLE goal_progress_events
  DROP CONSTRAINT IF EXISTS goal_progress_events_source_check;
ALTER TABLE goal_progress_events
  ADD CONSTRAINT goal_progress_events_source_check
  CHECK (source IN ('manual', 'task_completion', 'routine_completion', 'daily_track_check', 'activity_session'));
