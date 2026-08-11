-- 자동 등록에서 제외할 카드 알림.
--
-- 가족 카드가 같은 폰으로 알림이 오는 경우가 있다.
-- (예: 토스뱅크 '엄마 카드' — 어머님이 쓰시는 카드라 우리 가계부에 넣으면 안 된다)
-- 알림 원문에 여기 등록한 문구가 들어있으면 저장도 하지 않고 버린다.
--
-- 카드사 규칙과 무관하게 동작하므로, 새 카드사가 추가돼도 그대로 적용된다.

CREATE TABLE IF NOT EXISTS card_notification_ignores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- 알림 원문에 이 문구가 들어있으면 무시한다 (부분 일치)
  match_text TEXT NOT NULL,
  note TEXT DEFAULT '',          -- 왜 제외하는지 (사람이 나중에 보려고)

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_notification_ignores_active
  ON card_notification_ignores(household_id, is_active);

ALTER TABLE card_notification_ignores ENABLE ROW LEVEL SECURITY;

-- 확인용:
-- SELECT match_text, note FROM card_notification_ignores WHERE is_active;
