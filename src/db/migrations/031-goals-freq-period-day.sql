-- 목표 빈도 단위에 'day' 추가 (매일)
ALTER TABLE goals
  DROP CONSTRAINT IF EXISTS goals_freq_period_check;

ALTER TABLE goals
  ADD CONSTRAINT goals_freq_period_check
  CHECK (freq_period IS NULL OR freq_period IN ('day', 'week', 'month'));
