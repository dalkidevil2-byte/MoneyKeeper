-- ============================================================================
-- 006 마이그레이션: 할일/루틴 (tasks + task_completions)
-- "My Assistant" 허브의 3번째 모듈인 TODO 모듈을 위한 테이블.
-- ============================================================================

-- ─────────────────────────────────────────
-- tasks (할일 / 루틴 템플릿)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- 분류: 일회성 / 루틴 템플릿
  type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (type IN ('one_time', 'routine')),

  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  category_main TEXT DEFAULT '',
  category_sub  TEXT DEFAULT '',

  -- 담당 (가계부 패턴 동일: 단일 + 다중)
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_ids UUID[] DEFAULT '{}',

  -- 시간
  is_fixed BOOLEAN DEFAULT FALSE,         -- true=시간 필수(고정), false=유동
  due_date DATE,                          -- one_time 표시 기준일 (routine은 start_date 의미로 활용 가능)
  due_time TIME,                          -- is_fixed=true 일 때만 사용

  -- 상태 (one_time 전용; routine은 task_completions 로 추적)
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','snoozed','cancelled')),
  snoozed_to DATE,
  completed_at TIMESTAMPTZ,

  -- 우선순위
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high')),

  -- 루틴 규칙 (type='routine' 일 때만 사용)
  --   { "freq":"daily" }
  --   { "freq":"weekly", "weekdays":[1,3,5] }      -- 0=일, 6=토
  --   { "freq":"interval", "every_days":21 }       -- N일마다
  --   { "freq":"count_per_period", "count":2, "period":"week" }  -- 주 N회
  recurrence JSONB,

  -- 루틴 활성 여부 (보관/일시정지)
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_household_due
  ON tasks(household_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_household_status
  ON tasks(household_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_household_type
  ON tasks(household_id, type);
CREATE INDEX IF NOT EXISTS idx_tasks_member
  ON tasks(member_id);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────
-- task_completions (루틴/일회성 완료 기록)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  UNIQUE(task_id, completed_on)
);

CREATE INDEX IF NOT EXISTS idx_task_completions_household_date
  ON task_completions(household_id, completed_on);
CREATE INDEX IF NOT EXISTS idx_task_completions_task
  ON task_completions(task_id);
