-- 018: 할일 하위 체크리스트 (subtasks)
-- 한 task 안에 여러 줄의 체크박스 항목 추가 가능

CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  is_done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_task ON task_checklist_items(task_id, position);
CREATE INDEX IF NOT EXISTS idx_checklist_household ON task_checklist_items(household_id);

DROP TRIGGER IF EXISTS trg_checklist_updated_at ON task_checklist_items;
CREATE TRIGGER trg_checklist_updated_at
  BEFORE UPDATE ON task_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
