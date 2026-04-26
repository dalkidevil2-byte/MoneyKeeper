-- 011: 노션 가져오기 체크박스 필터
-- 지정된 체크박스 속성이 true 인 페이지만 가져옴
ALTER TABLE todo_notion_sources
  ADD COLUMN IF NOT EXISTS filter_property TEXT DEFAULT '';
