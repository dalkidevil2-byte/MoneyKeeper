-- 가구별 외부 서비스 통합 시크릿 (노션 토큰 등)
-- 평문으로 저장 — Supabase RLS / 액세스 제한에 의존.
-- 가족 단위 앱이라 별도 KMS 없이 단순 보관.
CREATE TABLE IF NOT EXISTS app_secrets (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, key)
);
