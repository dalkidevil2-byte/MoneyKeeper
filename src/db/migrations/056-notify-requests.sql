-- /api/transactions/notify 로 들어온 요청 기록.
--
-- 왜 필요한가:
--   card_notifications 에는 '거래로 이어진 알림' 만 남는다.
--   그래서 중복으로 막힌 경우·카드 알림이 아니라 버린 경우·인증 실패한 경우는
--   흔적이 전혀 없고, "폰이 안 보낸 것" 과 "보냈는데 서버가 버린 것" 을 구분할 수 없다.
--   폰 자동화가 동작하는지 진단하려면 들어온 요청 자체가 남아야 한다.
--
-- 개인정보:
--   카드 알림 형식이 아닌 요청(개인 카톡이 잘못 넘어온 경우)은 본문을 저장하지 않는다.
--   요청이 왔다는 사실과 길이만 남긴다.

CREATE TABLE IF NOT EXISTS notify_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  result TEXT NOT NULL,          -- created | duplicate | unparsed | ignored | unauthorized | error | empty
  reason TEXT DEFAULT '',        -- 버린 이유 / 오류 메시지
  source TEXT DEFAULT 'unknown', -- kakao | sms | unknown

  raw_text TEXT DEFAULT '',      -- 카드 알림으로 인정된 경우만 저장
  text_length INT DEFAULT 0,     -- 저장하지 않은 경우에도 길이는 남긴다

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notify_requests_created
  ON notify_requests(created_at DESC);

ALTER TABLE notify_requests ENABLE ROW LEVEL SECURITY;

-- 진단용 조회:
--   SELECT created_at, result, reason, left(raw_text, 80)
--   FROM notify_requests ORDER BY created_at DESC LIMIT 20;
--
-- 오래된 기록 정리(원할 때 수동 실행):
--   DELETE FROM notify_requests WHERE created_at < now() - interval '30 days';
