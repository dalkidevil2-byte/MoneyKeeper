-- 텔레그램에서 캡쳐 → AI 분석 결과를 저장 후 사용자 확인 받고 등록할 수 있게.
-- inline keyboard 의 callback_data 에 이 row 의 id 를 넣어 1시간 내 확정.
CREATE TABLE IF NOT EXISTS telegram_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  household_id UUID NOT NULL,
  member_id UUID,
  kind TEXT NOT NULL,                 -- 'stock_trades_import' 등
  payload JSONB NOT NULL,             -- 분석 결과 (trades 배열 등)
  message_id BIGINT,                  -- 알림 메시지의 telegram message_id
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_telegram_pending_chat
  ON telegram_pending_actions(chat_id, status);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_expires
  ON telegram_pending_actions(expires_at)
  WHERE status = 'pending';
