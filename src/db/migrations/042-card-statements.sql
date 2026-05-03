-- 신용카드 청구서 / 결제 대금 관리
CREATE TABLE IF NOT EXISTS card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,

  -- 청구 기간 (이 기간 내 거래 합계와 청구액 비교)
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,

  -- 결제일 (출금일)
  payment_due_date DATE NOT NULL,

  -- 실제 카드사가 청구한 금액
  billed_amount BIGINT NOT NULL DEFAULT 0,

  -- 출금 계좌 (결제 시 빠져나갈 계좌)
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,

  -- 상태: pending(예정) / paid(결제 완료) / cancelled
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),

  -- 결제일에 자동 생성된 transfer 거래 연결
  paid_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,

  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_card_stmt_household_due
  ON card_statements(household_id, payment_due_date DESC);
CREATE INDEX IF NOT EXISTS idx_card_stmt_pm
  ON card_statements(payment_method_id, billing_period_start DESC);
CREATE INDEX IF NOT EXISTS idx_card_stmt_status
  ON card_statements(household_id, status);

CREATE TRIGGER trg_card_stmt_updated_at
  BEFORE UPDATE ON card_statements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
