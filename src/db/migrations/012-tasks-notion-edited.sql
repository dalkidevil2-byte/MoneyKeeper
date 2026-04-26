-- 012: 노션 페이지 변경 시각 캐시
-- last_edited_time 비교로 변경된 페이지만 update

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS notion_last_edited_time TIMESTAMPTZ;
