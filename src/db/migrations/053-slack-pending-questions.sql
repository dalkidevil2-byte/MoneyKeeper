-- 슬랙 Q&A 대기열.
-- 흐름: 슬랙 → 클라우드(/api/slack/events)가 이 테이블에 적재
--   - PC 켜짐: 데몬(집사-클코)이 폴링해서 status='pending' 을 claim → 답(무료) → 'done'
--   - PC 꺼짐: 60초 넘게 'pending' 으로 남으면 클라우드 fallback 이 OpenAI 로 답 → 'done'
-- 서버(클라우드/데몬) 모두 SERVICE_ROLE_KEY 로 접근하므로 RLS 우회.
CREATE TABLE IF NOT EXISTS slack_pending_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  thread_ts TEXT,                    -- 스레드 답변용 (없으면 채널 메인)
  slack_ts TEXT NOT NULL,            -- 원본 메시지 ts (리액션 + 중복방지 키)
  slack_event_id TEXT,               -- Slack event_id (재전송 중복 방지)
  user_id TEXT,                      -- 보낸 사람 Slack user id
  text TEXT NOT NULL,                -- 질문 내용
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  engine TEXT,                       -- 'claude' | 'openai' (답한 주체)
  answer TEXT,                       -- 답변 본문 (로그용)
  claimed_by TEXT,                   -- 처리 주체 식별자 (데몬 호스트 등)
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 메시지 중복 적재 방지 (Slack 이벤트 재전송 대비)
CREATE UNIQUE INDEX IF NOT EXISTS uq_slack_pending_ts
  ON slack_pending_questions(channel, slack_ts);

-- 데몬/fallback 이 pending 을 빨리 찾도록
CREATE INDEX IF NOT EXISTS idx_slack_pending_status
  ON slack_pending_questions(status, created_at);

ALTER TABLE slack_pending_questions ENABLE ROW LEVEL SECURITY;

-- 확인용:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename='slack_pending_questions';
