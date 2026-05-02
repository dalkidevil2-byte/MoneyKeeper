-- 아카이브 컬렉션 카드 레이아웃 옵션
-- 'list' (default): 텍스트만 (현재 동작)
-- 'gallery': 첨부파일 속성의 첫 이미지를 표지로 표시
ALTER TABLE archive_collections
  ADD COLUMN IF NOT EXISTS card_layout TEXT NOT NULL DEFAULT 'list'
    CHECK (card_layout IN ('list', 'gallery'));
