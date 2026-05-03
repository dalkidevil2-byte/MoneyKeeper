-- 할일에 시작 시간(선택) 추가
-- start_date 와 함께 — 시작일이 도래하고 그 시간 이후부터 노출 가능
-- 예: 5/10 09:00 부터 시작 가능한 할일
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS start_time TIME;
