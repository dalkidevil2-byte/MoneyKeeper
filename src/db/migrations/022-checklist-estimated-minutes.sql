-- 022: 체크리스트 항목 소요시간 (분)
ALTER TABLE task_checklist_items
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
