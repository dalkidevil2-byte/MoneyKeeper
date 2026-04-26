-- 021: Daily Track 입력 옵션 확장
-- - weekdays: 활성 요일 (예: 매주 월·수·금만 노출). NULL/비어있으면 매일.
-- - until_count: 총 N회 완료까지만 (도달하면 자동 비활성화)
-- start_date / end_date 는 이미 있음

ALTER TABLE daily_tracks
  ADD COLUMN IF NOT EXISTS weekdays SMALLINT[],
  ADD COLUMN IF NOT EXISTS until_count INTEGER;
