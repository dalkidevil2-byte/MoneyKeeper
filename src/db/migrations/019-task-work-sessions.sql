-- 019: 할일(todo)의 작업 세션
-- 한 할일을 여러 시간 슬롯으로 나눠서 계획 가능
-- 예: 보고서 기한 5/10
--     세션 1: 5/8 14:00-16:00
--     세션 2: 5/9 10:00-12:00
-- 타임테이블에 블록으로 표시 + 드래그로 이동/길이 조절

CREATE TABLE IF NOT EXISTS task_work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME,                   -- NULL 이면 종일 (캘린더 점만, 타임테이블 노출 X)
  end_time TIME,
  is_done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_sessions_task ON task_work_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_household_date
  ON task_work_sessions(household_id, session_date);

DROP TRIGGER IF EXISTS trg_work_sessions_updated_at ON task_work_sessions;
CREATE TRIGGER trg_work_sessions_updated_at
  BEFORE UPDATE ON task_work_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
