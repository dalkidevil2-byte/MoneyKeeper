-- 023: 일정/할일 비용 → 가계부 연동
-- task / work session 에 비용 + 결제수단/계좌 + 카테고리 옵션 추가
-- 완료 시 transactions 테이블에 거래 자동 생성, transaction_id 로 연결

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS expense_amount BIGINT,
  ADD COLUMN IF NOT EXISTS expense_category_main TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expense_category_sub TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

ALTER TABLE task_work_sessions
  ADD COLUMN IF NOT EXISTS expense_amount BIGINT,
  ADD COLUMN IF NOT EXISTS expense_category_main TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expense_category_sub TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_expense_tx ON tasks(expense_transaction_id)
  WHERE expense_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_sessions_expense_tx ON task_work_sessions(expense_transaction_id)
  WHERE expense_transaction_id IS NOT NULL;
