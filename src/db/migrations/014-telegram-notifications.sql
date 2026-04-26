-- 014: 텔레그램 알림
-- 1) 가구별 봇 토큰 설정
-- 2) 멤버별 chat_id (개인 메시지 수신용)
-- 3) 발송 중복 방지 로그

CREATE TABLE IF NOT EXISTS telegram_settings (
  household_id UUID PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  bot_token TEXT NOT NULL DEFAULT '',
  bot_username TEXT DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS telegram_username TEXT DEFAULT '';

-- 발송 로그 (중복 방지)
-- 동일 task + lead_minutes 조합은 한 번만
CREATE TABLE IF NOT EXISTS telegram_sent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  occurrence_date DATE NOT NULL,
  lead_minutes INTEGER NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, occurrence_date, lead_minutes, member_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_sent_log_household_date
  ON telegram_sent_log(household_id, occurrence_date);
