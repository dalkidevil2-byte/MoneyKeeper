-- ============================================================================
-- 010 마이그레이션: TODO 모듈 노션 가져오기
-- - todo_notion_sources: 사용자가 등록한 노션 DB URL + 토큰 + 매핑
-- - tasks.source / tasks.source_external_id: 외부 출처 표시 (중복 방지 + 아이콘)
-- ============================================================================

CREATE TABLE IF NOT EXISTS todo_notion_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',                 -- 별칭 (예: "회사 캘린더")
  notion_token TEXT NOT NULL,                    -- Notion Integration Token (secret)
  database_id TEXT NOT NULL,                     -- 노션 DB ID (uuid)
  database_url TEXT NOT NULL DEFAULT '',         -- 사용자 입력 원본 URL
  -- 속성 매핑 (NULL 이면 자동 추정)
  title_property  TEXT DEFAULT '',               -- 제목 속성명 (보통 'Name')
  date_property   TEXT DEFAULT '',               -- Date 속성명
  member_property TEXT DEFAULT '',               -- People 속성명 (선택)
  category_property TEXT DEFAULT '',             -- Select 속성명 (선택, → category_main)
  last_imported_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todo_notion_sources_household
  ON todo_notion_sources(household_id);

DROP TRIGGER IF EXISTS trg_todo_notion_sources_updated_at ON todo_notion_sources;
CREATE TRIGGER trg_todo_notion_sources_updated_at
  BEFORE UPDATE ON todo_notion_sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- tasks 에 출처 컬럼
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  -- manual | notion
  ADD COLUMN IF NOT EXISTS source_external_id TEXT;
  -- notion 의 경우 page_id (UNIQUE 는 source_id+external_id 조합으로 application 단에서 체크)

CREATE INDEX IF NOT EXISTS idx_tasks_source_external
  ON tasks(source, source_external_id)
  WHERE source_external_id IS NOT NULL;
