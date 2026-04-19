-- ============================================================================
-- 004 마이그레이션: 다수 지출 대상 (예: 커피를 부부 둘만 마셨음)
--
-- 새 컬럼 target_member_ids UUID[] 추가.
-- 기존 target_member_id는 호환성 유지 — 단일 값 입력/조회용으로 남겨둠.
-- 통계는 새 배열을 우선 사용하고 비어있으면 단일 값으로 폴백.
--
-- 적용 후 한 줄 백필도 함께 실행해 기존 데이터 이전:
--   UPDATE transactions
--      SET target_member_ids = ARRAY[target_member_id]
--    WHERE target_member_id IS NOT NULL
--      AND (target_member_ids IS NULL OR cardinality(target_member_ids) = 0);
-- ============================================================================

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS target_member_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_transactions_target_member_ids
  ON transactions USING GIN (target_member_ids);

-- 기존 데이터 백필
UPDATE transactions
   SET target_member_ids = ARRAY[target_member_id]
 WHERE target_member_id IS NOT NULL
   AND (target_member_ids IS NULL OR cardinality(target_member_ids) = 0);
