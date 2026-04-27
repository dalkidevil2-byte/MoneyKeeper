-- 할일 자체의 예상 소요시간 (분)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER;
