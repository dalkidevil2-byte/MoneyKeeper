-- AI 사용량 / 비용 추적
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT NOT NULL,            -- gpt-4o-mini, gpt-4o, tts-1, whisper-1 등
  feature TEXT NOT NULL,          -- briefing, tts, assistant, condition, ocr, parse 등
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  audio_chars INTEGER DEFAULT 0,  -- TTS 입력 글자수
  audio_seconds NUMERIC DEFAULT 0,-- Whisper 입력 초
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  cost_krw NUMERIC(10, 2) DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_household_date
  ON ai_usage(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature
  ON ai_usage(household_id, feature, created_at DESC);
