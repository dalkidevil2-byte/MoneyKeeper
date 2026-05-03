-- ============================================================
-- 💼 MoneyKeeper 셋업용 합본 스키마 (주식 메뉴 제외)
-- ============================================================
-- 사용법:
--   1) Supabase 대시보드 → SQL Editor → New query
--   2) 이 파일 전체 내용 복사해서 붙여넣기
--   3) 우하단 'Run' 클릭
--   4) 'Success. No rows returned' 메시지 확인
-- ============================================================

-- ─────────────────────────────────────────
-- 1. Households (가구 — 1인 사용자도 가구 1개)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 2. Members (구성원 — 솔로 모드는 본인 1명만)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 3. Accounts (계좌/자산)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank'
    CHECK (type IN ('bank', 'cash', 'easy_pay_balance', 'investment', 'virtual_balance')),
  balance BIGINT DEFAULT 0,
  is_budget_account BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 4. Payment Methods (결제수단)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'debit_card'
    CHECK (type IN ('debit_card', 'credit_card', 'easy_pay', 'cash', 'bank_transfer')),
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  billing_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  billing_day SMALLINT,
  is_budget_card BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 5. Transactions (거래)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_ids UUID[] DEFAULT '{}',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  type TEXT NOT NULL DEFAULT 'variable_expense'
    CHECK (type IN ('income', 'fixed_expense', 'variable_expense', 'transfer', 'refund', 'adjustment')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  name TEXT NOT NULL DEFAULT '',
  merchant_name TEXT DEFAULT '',
  account_from_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  account_to_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  category_main TEXT DEFAULT '',
  category_sub TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'reviewed'
    CHECK (status IN ('draft', 'reviewed', 'confirmed', 'cancelled')),
  input_type TEXT NOT NULL DEFAULT 'text'
    CHECK (input_type IN ('text', 'voice', 'receipt', 'manual')),
  memo TEXT DEFAULT '',
  tags TEXT[] DEFAULT '{}',
  essential BOOLEAN DEFAULT false,
  notion_page_id TEXT DEFAULT '',
  sync_status TEXT DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  last_synced_at TIMESTAMPTZ,
  raw_input TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 6. Budgets (예산)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '생활비 예산',
  period_type TEXT NOT NULL DEFAULT 'monthly' CHECK (period_type IN ('monthly')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  warning_80 BOOLEAN DEFAULT true,
  warning_90 BOOLEAN DEFAULT true,
  warning_100 BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 7. Receipts (영수증 OCR 보관)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  image_url TEXT DEFAULT '',
  ocr_raw TEXT DEFAULT '',
  parsed_result_json JSONB DEFAULT '{}',
  total_amount BIGINT,
  merchant_name TEXT DEFAULT '',
  receipt_date DATE,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 8. Items (영수증 품목)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT DEFAULT '',
  representative_name TEXT DEFAULT '',
  price BIGINT NOT NULL DEFAULT 0,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit TEXT DEFAULT '개',
  unit_price BIGINT GENERATED ALWAYS AS (price / GREATEST(quantity, 1)) STORED,
  category_main TEXT DEFAULT '',
  category_sub TEXT DEFAULT '',
  essential BOOLEAN DEFAULT false,
  track BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────
-- 9. Custom Categories (사용자 정의 카테고리)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_main TEXT NOT NULL,
  category_sub TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_custom_categories_household ON custom_categories(household_id);

-- ─────────────────────────────────────────
-- 10. Fixed Expense Templates (고정지출 템플릿)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_expense_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount BIGINT NOT NULL,
  due_day SMALLINT NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  type TEXT DEFAULT 'fixed_expense',
  category_main TEXT DEFAULT '',
  category_sub TEXT DEFAULT '',
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  account_from_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  account_to_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  is_variable BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fixed_expense_templates_household ON fixed_expense_templates(household_id);

-- ─────────────────────────────────────────
-- 11. Tasks (할일/일정/루틴)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (type IN ('one_time', 'routine')),
  kind TEXT NOT NULL DEFAULT 'todo'
    CHECK (kind IN ('todo','event')),
  title TEXT NOT NULL,
  memo TEXT DEFAULT '',
  category_main TEXT DEFAULT '',
  category_sub  TEXT DEFAULT '',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_ids UUID[] DEFAULT '{}',
  is_fixed BOOLEAN DEFAULT FALSE,
  due_date DATE,
  due_time TIME,
  end_time TIME,
  start_date DATE,
  start_time TIME,
  until_date DATE,
  excluded_dates DATE[] DEFAULT '{}',
  deadline_date DATE,
  deadline_time TIME,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','done','snoozed','cancelled')),
  snoozed_to DATE,
  completed_at TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high')),
  recurrence JSONB,
  estimated_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  google_event_id TEXT,
  notion_page_id TEXT,
  notion_last_edited_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_household_due ON tasks(household_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_household_deadline ON tasks(household_id, deadline_date);
CREATE INDEX IF NOT EXISTS idx_tasks_household_status ON tasks(household_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_household_type ON tasks(household_id, type);
CREATE INDEX IF NOT EXISTS idx_tasks_household_kind ON tasks(household_id, kind);
CREATE INDEX IF NOT EXISTS idx_tasks_member ON tasks(member_id);

-- ─────────────────────────────────────────
-- 12. Task Completions (할일 완료 기록)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  completed_on DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  UNIQUE(task_id, completed_on)
);
CREATE INDEX IF NOT EXISTS idx_task_completions_household_date ON task_completions(household_id, completed_on);
CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id);

-- ─────────────────────────────────────────
-- 13. Task Checklist Items
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id, position);

-- ─────────────────────────────────────────
-- 14. Task Work Sessions (할일 세션 — 타이머)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_work_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_done BOOLEAN NOT NULL DEFAULT FALSE,
  done_at TIMESTAMPTZ,
  note TEXT DEFAULT '',
  expense_amount BIGINT,
  expense_category_main TEXT DEFAULT '',
  expense_category_sub TEXT DEFAULT '',
  expense_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  expense_payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  expense_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_sessions_household_date ON task_work_sessions(household_id, session_date);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_work_sessions(task_id);

-- ─────────────────────────────────────────
-- 15. Goals (목표)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT DEFAULT '🎯',
  color TEXT DEFAULT '#10b981',
  type TEXT NOT NULL DEFAULT 'numeric'
    CHECK (type IN ('numeric','task_count','session_count','session_minutes','daily_track')),
  target_count NUMERIC,
  target_unit TEXT DEFAULT '',
  freq TEXT
    CHECK (freq IN ('daily','weekly','monthly','custom') OR freq IS NULL),
  freq_period TEXT DEFAULT 'day'
    CHECK (freq_period IN ('day','week','month','year')),
  start_date DATE,
  end_date DATE,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goals_household ON goals(household_id, is_active);

-- ─────────────────────────────────────────
-- 16. Goal Progress Events
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goal_progress_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  occurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 1,
  source TEXT DEFAULT 'manual',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_goal_events_goal_date ON goal_progress_events(goal_id, occurred_on);

-- ─────────────────────────────────────────
-- 17. Daily Tracks (매일 트래킹)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  emoji TEXT DEFAULT '✓',
  color TEXT DEFAULT '#6366f1',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  reminder_time TIME,
  condition_text TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_track_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_track_id UUID NOT NULL REFERENCES daily_tracks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(daily_track_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_track_logs_date ON daily_track_logs(household_id, log_date);

-- ─────────────────────────────────────────
-- 18. Activities (활동 추적 — 시작/정지)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '⏱',
  color TEXT DEFAULT '#6366f1',
  category_main TEXT DEFAULT '',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  daily_track_id UUID REFERENCES daily_tracks(id) ON DELETE SET NULL,
  goal_count_mode TEXT DEFAULT 'session'
    CHECK (goal_count_mode IN ('session','hours')),
  is_active BOOLEAN DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  goal_progress_event_id UUID REFERENCES goal_progress_events(id) ON DELETE SET NULL,
  daily_track_log_id UUID REFERENCES daily_track_logs(id) ON DELETE SET NULL,
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_sessions_one_running
  ON activity_sessions(activity_id) WHERE end_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_activity_sessions_date ON activity_sessions(household_id, session_date);

-- ─────────────────────────────────────────
-- 19. Archive (아카이브 — Notion-lite)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS archive_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📦',
  color TEXT DEFAULT '#6366f1',
  description TEXT DEFAULT '',
  schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,
  card_layout TEXT NOT NULL DEFAULT 'list'
    CHECK (card_layout IN ('list','gallery')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archive_collections_household
  ON archive_collections(household_id, is_active);

CREATE TABLE IF NOT EXISTS archive_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES archive_collections(id) ON DELETE CASCADE,
  household_id UUID NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  member_id UUID,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_archive_entries_collection
  ON archive_entries(collection_id, position, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_entries_household
  ON archive_entries(household_id);

-- ─────────────────────────────────────────
-- 20. Notion / Google / Telegram Sync
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notion_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  database_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  filter_property TEXT,
  filter_value TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_calendar_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL UNIQUE REFERENCES households(id) ON DELETE CASCADE,
  chat_id TEXT,
  bot_token TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  lead_minutes INTEGER[] DEFAULT '{5,30}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_sent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL,
  notify_at TIMESTAMPTZ NOT NULL,
  lead_minutes INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, notify_at, lead_minutes)
);

CREATE TABLE IF NOT EXISTS telegram_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_history ON telegram_chat_history(household_id, created_at DESC);

-- ─────────────────────────────────────────
-- 21. App Secrets (외부 서비스 토큰 암호화 저장)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_secrets (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, key)
);

-- ─────────────────────────────────────────
-- 22. Push Subscriptions (PWA 웹 푸시 알림 구독 — 디바이스별)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_household
  ON push_subscriptions(household_id, is_active);

-- ─────────────────────────────────────────
-- 인덱스 (transactions / budgets / accounts / payment_methods)
-- ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_transactions_household_date ON transactions(household_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_sync_status ON transactions(sync_status);
CREATE INDEX IF NOT EXISTS idx_transactions_member ON transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_budgets_household ON budgets(household_id);
CREATE INDEX IF NOT EXISTS idx_accounts_household ON accounts(household_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_household ON payment_methods(household_id);

-- ─────────────────────────────────────────
-- updated_at 자동 갱신 트리거
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_households_updated_at    BEFORE UPDATE ON households    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_members_updated_at       BEFORE UPDATE ON members       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_accounts_updated_at      BEFORE UPDATE ON accounts      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_transactions_updated_at  BEFORE UPDATE ON transactions  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_budgets_updated_at       BEFORE UPDATE ON budgets       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_receipts_updated_at      BEFORE UPDATE ON receipts      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_items_updated_at         BEFORE UPDATE ON items         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tasks_updated_at         BEFORE UPDATE ON tasks         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_task_checklist_items_updated_at BEFORE UPDATE ON task_checklist_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_task_work_sessions_updated_at BEFORE UPDATE ON task_work_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_goals_updated_at         BEFORE UPDATE ON goals         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_daily_tracks_updated_at  BEFORE UPDATE ON daily_tracks  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_activities_updated_at    BEFORE UPDATE ON activities    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_activity_sessions_updated_at BEFORE UPDATE ON activity_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- activity_sessions 의 duration_minutes 자동 계산
CREATE OR REPLACE FUNCTION calc_activity_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.end_at IS NOT NULL AND NEW.start_at IS NOT NULL THEN
    NEW.duration_minutes := EXTRACT(EPOCH FROM (NEW.end_at - NEW.start_at)) / 60;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_activity_sessions_duration
  BEFORE INSERT OR UPDATE ON activity_sessions
  FOR EACH ROW EXECUTE FUNCTION calc_activity_duration();

-- ─────────────────────────────────────────
-- 잔액 업데이트 RPC 함수
-- ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_balance(account_id UUID, amount BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE accounts SET balance = balance + amount WHERE id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_balance(account_id UUID, amount BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE accounts SET balance = balance - amount WHERE id = account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────
-- 시드 데이터 (1인 사용자 기본값)
-- ─────────────────────────────────────────
-- 기본 가구 (UUID 는 Vercel 의 NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID 와 일치해야 함)
INSERT INTO households (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', '내 가구')
ON CONFLICT (id) DO NOTHING;

-- 본인 1명만
INSERT INTO members (household_id, name, role, color) VALUES
  ('00000000-0000-0000-0000-000000000001', '나', 'admin', '#6366f1')
ON CONFLICT DO NOTHING;

-- 기본 계좌 (편하게 시작)
INSERT INTO accounts (household_id, name, type, balance, is_budget_account) VALUES
  ('00000000-0000-0000-0000-000000000001', '주거래 통장', 'bank', 0, false),
  ('00000000-0000-0000-0000-000000000001', '생활비 통장', 'bank', 0, true),
  ('00000000-0000-0000-0000-000000000001', '현금', 'cash', 0, false)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ✅ 완료! 'Success. No rows returned' 가 보이면 정상.
-- 이제 Vercel 배포로 넘어가세요.
-- ============================================================
