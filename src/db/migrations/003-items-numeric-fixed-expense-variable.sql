-- ============================================================================
-- 003 마이그레이션: 가계부 보완
-- 1) items.quantity를 NUMERIC(10,2)로 변경 (소수 수량 입력)
-- 2) fixed_expense_templates에 is_variable 추가 (변동 고정지출)
-- ============================================================================

-- ─── items.quantity INTEGER → NUMERIC(10,2) ───────────────────
-- unit_price가 quantity를 참조하는 generated column이므로 임시 제거 후 재생성
ALTER TABLE items DROP COLUMN IF EXISTS unit_price;
ALTER TABLE items
  ALTER COLUMN quantity TYPE NUMERIC(10, 2) USING quantity::numeric;
ALTER TABLE items
  ADD COLUMN unit_price BIGINT GENERATED ALWAYS AS (price / GREATEST(quantity, 1)) STORED;

-- ─── fixed_expense_templates 변동 금액 플래그 ──────────────────
ALTER TABLE fixed_expense_templates
  ADD COLUMN IF NOT EXISTS is_variable BOOLEAN DEFAULT false;
