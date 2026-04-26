-- ============================================================================
-- 015: 목표(Goals) 모듈
-- - frequency: 주/월 N회 빈도 목표 (예: 주 2회 운동)
-- - quantitative: 성취 누적 목표 (예: 아이언 100)
-- - deadline: 단일 기한 마감 목표 (예: 5월까지 논문)
-- tasks.goal_id 로 할일/루틴을 목표에 연결.
-- 완료 시 goal_progress_events 에 +1 기록.
-- ============================================================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  type TEXT NOT NULL CHECK (type IN ('frequency', 'quantitative', 'deadline')),
  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  emoji TEXT DEFAULT '🎯',
  category_main TEXT DEFAULT '',

  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_ids UUID[] DEFAULT '{}',

  -- frequency
  freq_count INTEGER,            -- 주/월당 목표 횟수 (frequency 전용)
  freq_period TEXT CHECK (freq_period IN ('week', 'month')),

  -- quantitative
  target_value NUMERIC(14, 2),   -- 목표치
  unit TEXT DEFAULT '',          -- 'kg', '회', '권', '원' 등

  -- deadline + frequency 의 종료 시점
  start_date DATE,
  due_date DATE,                 -- 목표 마감일

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'achieved', 'cancelled')),
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goals_household_status ON goals(household_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_household_type ON goals(household_id, type);

DROP TRIGGER IF EXISTS trg_goals_updated_at ON goals;
CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 진행 이벤트 — 자동(task complete) + 수동(+1, +N)
CREATE TABLE IF NOT EXISTS goal_progress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  delta NUMERIC(14, 2) NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'task_completion', 'routine_completion')),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_completion_id UUID REFERENCES task_completions(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  -- 루틴 완료 1건당 한 번만 카운트되도록
  UNIQUE(goal_id, task_completion_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_progress_goal_date
  ON goal_progress_events(goal_id, occurred_on);
CREATE INDEX IF NOT EXISTS idx_goal_progress_household_date
  ON goal_progress_events(household_id, occurred_on);

-- tasks 에 goal_id 추가
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id) WHERE goal_id IS NOT NULL;
