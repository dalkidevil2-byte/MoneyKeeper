-- Daily Track 자동 체크 조건 (자연어)
-- 예: "12시 전 취침", "30분 이상 운동", "독서 30분 이상"
-- 연결된 활동 정지 시 AI 가 평가해서 충족 시 자동 체크
ALTER TABLE daily_tracks
  ADD COLUMN IF NOT EXISTS condition_text TEXT NOT NULL DEFAULT '';
