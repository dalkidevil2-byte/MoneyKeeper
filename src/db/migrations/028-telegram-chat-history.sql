-- 텔레그램 봇 ↔ AI 대화 기록 (chat_id 별 history 유지)
CREATE TABLE IF NOT EXISTS telegram_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_chat_hist_chat
  ON telegram_chat_history(chat_id, created_at DESC);
