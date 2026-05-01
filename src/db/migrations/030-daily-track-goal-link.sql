-- Daily Track ↔ 목표 연결
ALTER TABLE daily_tracks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_tracks_goal
  ON daily_tracks(goal_id) WHERE goal_id IS NOT NULL;

-- goal_progress_events 에 daily_track_log_id 추가 (체크 1건 = 진행 +1, 해제 시 cascade 삭제)
ALTER TABLE goal_progress_events
  ADD COLUMN IF NOT EXISTS daily_track_log_id UUID
  REFERENCES daily_track_logs(id) ON DELETE CASCADE;

-- source enum 에 daily_track_check 추가
ALTER TABLE goal_progress_events
  DROP CONSTRAINT IF EXISTS goal_progress_events_source_check;
ALTER TABLE goal_progress_events
  ADD CONSTRAINT goal_progress_events_source_check
  CHECK (source IN ('manual', 'task_completion', 'routine_completion', 'daily_track_check'));

-- 같은 (goal, daily_track_log) 1회만 카운트
ALTER TABLE goal_progress_events
  DROP CONSTRAINT IF EXISTS goal_progress_events_unique_dt_log;
ALTER TABLE goal_progress_events
  ADD CONSTRAINT goal_progress_events_unique_dt_log
  UNIQUE (goal_id, daily_track_log_id);
