-- 카드 결제 알림(카톡 알림톡 / 문자) 수신 로그.
--
-- 흐름: 폰(Automate/MacroDroid 등) → /api/transactions/notify → 이 테이블에 적재
--   - 파싱 성공: transactions 에 draft 거래 생성 후 transaction_id 연결 (status='parsed')
--   - 파싱 실패: 원문만 적재 (status='unparsed') → 나중에 카드사 규칙 추가용 자료
--   - 중복 수신: dedupe_key UNIQUE 위반 → 거래 생성 안 함
--
-- 서버 API 만 SERVICE_ROLE_KEY 로 접근하므로 RLS 우회.

CREATE TABLE IF NOT EXISTS card_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  source TEXT NOT NULL DEFAULT 'unknown'
    CHECK (source IN ('kakao', 'sms', 'unknown')),
  raw_text TEXT NOT NULL,              -- 알림 원문 (정리 후)

  -- 같은 결제 중복 적재 방지 키.
  -- 파싱 성공: 카드사|끝4자리|승인구분|금액|시각|가맹점
  -- 파싱 실패: unparsed:<원문 앞 300자>
  dedupe_key TEXT NOT NULL,

  -- 파싱 결과 (디버깅 / 규칙 개선용)
  rule TEXT DEFAULT '',                -- 매칭된 규칙 이름 (e.g. 'samsung-v1')
  issuer TEXT DEFAULT '',              -- '삼성카드'
  card_last4 TEXT DEFAULT '',
  approved BOOLEAN,                    -- true=승인, false=취소
  amount BIGINT,
  merchant TEXT DEFAULT '',
  occurred_at TEXT DEFAULT '',         -- 'YYYY-MM-DDTHH:mm' (카드사 표기 그대로, TZ 없음)

  status TEXT NOT NULL DEFAULT 'unparsed'
    CHECK (status IN ('parsed', 'unparsed')),

  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 결제 알림이 두 번 오는 것 방지 (카톡+문자 동시 수신, 재전송 등)
CREATE UNIQUE INDEX IF NOT EXISTS uq_card_notifications_dedupe
  ON card_notifications(household_id, dedupe_key);

-- 규칙 미등록 알림을 빨리 찾기 위함 (새 카드사 규칙 추가 시 사용)
CREATE INDEX IF NOT EXISTS idx_card_notifications_status
  ON card_notifications(status, created_at DESC);

ALTER TABLE card_notifications ENABLE ROW LEVEL SECURITY;

-- 확인용:
-- SELECT status, issuer, count(*) FROM card_notifications GROUP BY 1,2;
-- SELECT raw_text FROM card_notifications WHERE status='unparsed' ORDER BY created_at DESC LIMIT 20;
