-- 017: 할일(todo) 의 시작일 — 이 날짜부터 ~ deadline_date 까지 기간
-- start_date 가 미래면 할일 리스트에서 숨김 (시작일 도래 후 노출)

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS start_date DATE;
