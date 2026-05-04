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
    CHECK (type IN ('bank', 'cash', 'easy_pay_balance', 'investment', 'virtual_balance', 'points')),
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
  archive_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  transaction_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  google_event_id TEXT,
  notion_page_id TEXT,
  notion_last_edited_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_archive_links_gin
  ON tasks USING GIN (archive_links);
CREATE INDEX IF NOT EXISTS idx_tasks_transaction_links_gin
  ON tasks USING GIN (transaction_links);
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
  link_collection_id UUID REFERENCES archive_collections(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activities_link_collection
  ON activities(link_collection_id) WHERE link_collection_id IS NOT NULL;

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
  archive_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_sessions_archive_links_gin
  ON activity_sessions USING GIN (archive_links);
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
  member_id UUID,
  occurrence_date DATE NOT NULL,
  lead_minutes INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 중복 발송 방지 (member 있는 경우 / 없는 경우 분리)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tg_sent_log_with_member
  ON telegram_sent_log(task_id, occurrence_date, lead_minutes, member_id)
  WHERE member_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tg_sent_log_no_member
  ON telegram_sent_log(task_id, occurrence_date, lead_minutes)
  WHERE member_id IS NULL;

-- 텔레그램 캡쳐 → 확인 후 등록용 pending 큐
CREATE TABLE IF NOT EXISTS telegram_pending_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT NOT NULL,
  household_id UUID NOT NULL,
  member_id UUID,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  message_id BIGINT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 hour')
);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_chat
  ON telegram_pending_actions(chat_id, status);

-- 주식 시세 영구 캐시 (장 종료 후 외부 API 호출 줄임 + NXT 가격 분리)
CREATE TABLE IF NOT EXISTS stock_quote_cache (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  previous_close NUMERIC,
  change_amount NUMERIC,
  change_percent NUMERIC,
  short_name TEXT,
  currency TEXT,
  market_state TEXT,
  source TEXT,
  nxt_price NUMERIC,
  nxt_change_amount NUMERIC,
  nxt_change_percent NUMERIC,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_close_price NUMERIC,
  last_close_date DATE
);
CREATE INDEX IF NOT EXISTS idx_stock_quote_cache_fetched_at
  ON stock_quote_cache(fetched_at DESC);

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
-- AI 사용량 / 비용 추적 (선택 — 설정에서 비용 확인용)
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  model TEXT NOT NULL,
  feature TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  audio_chars INTEGER DEFAULT 0,
  audio_seconds NUMERIC DEFAULT 0,
  cost_usd NUMERIC(10, 6) DEFAULT 0,
  cost_krw NUMERIC(10, 2) DEFAULT 0,
  meta JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_household_date
  ON ai_usage(household_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_feature
  ON ai_usage(household_id, feature, created_at DESC);

-- ============================================================
-- 카드 청구서 / 결제 대금 관리
-- ============================================================
CREATE TABLE IF NOT EXISTS card_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  payment_method_id UUID NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
  billing_period_start DATE NOT NULL,
  billing_period_end   DATE NOT NULL,
  payment_due_date DATE NOT NULL,
  billed_amount BIGINT NOT NULL DEFAULT 0,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
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

-- ARCHIVE_TEMPLATE_START
-- 자동 생성됨 — scripts/dump-archive-template.mjs 로 갱신하세요.
-- 마지막 dump: 2026-05-03T10:21:07.476Z
-- 컬렉션 16개

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '3줄일기', '📔', '#f59e0b', '하루 3줄로 짧게 기록', '[{"key":"__","type":"text","label":"오늘은 무슨일이?"},{"key":"date","type":"date","label":"날짜","required":true},{"key":"tomorrow","type":"longtext","label":"오늘의 인사이트"},{"key":"gratitude_diary","type":"longtext","label":"감사일기"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='3줄일기' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '영어 한마디', '🗣️', '#4CAF50', '매일 한마디씩 비즈니스 영어 회화 패턴 학습', '[{"key":"title","type":"text","label":"한마디","required":true},{"key":"pattern","type":"longtext","label":"회화 패턴"},{"key":"date","type":"date","label":"날짜"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='영어 한마디' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '맛집 리스트', '🍽️', '#ff6347', '추천하는 맛집을 기록하는 리스트', '[{"key":"title","type":"text","label":"맛집 이름","required":true},{"key":"location","type":"text","label":"위치","required":true},{"key":"menu","type":"longtext","label":"메뉴"},{"key":"cuisine","type":"select","label":"음식 종류","options":["한식","중식","일식","양식","패스트푸드"]},{"key":"rating","type":"rating","label":"평점","required":false},{"key":"visit_date","type":"date","label":"방문 날짜","required":false},{"key":"features","type":"longtext","label":"특징"},{"key":"business_hours","type":"text","label":"영업시간"},{"key":"recommended_menu","type":"longtext","label":"추천메뉴"},{"key":"notes","type":"longtext","label":"메모","required":false},{"key":"url","type":"url","label":"웹사이트"},{"key":"field_12","type":"url","label":"출처"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='맛집 리스트' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '운동 따라하기', '🏋️', '#4caf50', '어떤 운동을 할지 모르겠을때 따라할 수 있도록', '[{"key":"title","type":"text","label":"운동 이름","required":true},{"key":"url","type":"url","label":"URL","required":false},{"key":"exercise_date","type":"date","label":"운동 날짜","required":true},{"key":"duration","type":"number","label":"운동 시간 (분)","required":true},{"key":"intensity","type":"select","label":"운동 강도","options":["낮음","보통","높음"],"required":true},{"key":"notes","type":"longtext","label":"메모","required":false}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='운동 따라하기' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '백대명산', '🏔️', '#4caf50', '등산 기록을 관리하는 컬렉션', '[{"key":"challenge_number","type":"text","label":"산"},{"key":"field8","type":"number","label":"챌린지 번호"},{"key":"hike_date","type":"date","label":"등산 날짜","required":true},{"key":"difficulty","type":"select","label":"난이도","options":["쉬움","보통","어려움"]},{"key":"duration","type":"number","label":"소요 시간 (시간)","required":true},{"key":"companions","type":"multiselect","label":"동행자","options":["혼자","친구","가족","동호회"]},{"key":"field_7","type":"files","label":"사진"},{"key":"notes","type":"longtext","label":"메모"}]'::jsonb, 0, 'gallery', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='백대명산' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '여행 준비물 리스트', '🧳', '#4a90e2', '여행에 필요한 준비물을 체크할 수 있는 리스트', '[{"key":"title","type":"text","label":"여행 제목","required":true},{"key":"travel_type","type":"select","label":"여행 종류","options":["국내 장기 여행","국내 단기 여행","해외 여행","출장","등산","다낭 여행"]},{"key":"departure_date","type":"date","label":"출발 날짜","required":true},{"key":"return_date","type":"date","label":"귀환 날짜"},{"key":"checklist","type":"checklist","label":"필수 리스트"},{"key":"toiletries","type":"checklist","label":"세면도구"},{"key":"clothing","type":"checklist","label":"의류"},{"key":"electronics","type":"checklist","label":"전자기기"},{"key":"documents","type":"checklist","label":"서류"},{"key":"snacks","type":"checklist","label":"간식"},{"key":"first_aid_kit","type":"checklist","label":"의약품"},{"key":"other_items","type":"checklist","label":"기타항목"},{"key":"_","type":"relation","label":"여행 관계형"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='여행 준비물 리스트' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '골프 영상', '⛳️', '#4caf50', '골프 관련 영상을 저장하는 컬렉션', '[{"key":"title","type":"text","label":"제목","required":true},{"key":"video_url","type":"url","label":"영상 URL","required":true},{"key":"upload_date","type":"date","label":"업로드 날짜","required":true},{"key":"tags","type":"multiselect","label":"태그","options":["드라이버","퍼팅","아이언","팟","기타"]},{"key":"notes","type":"longtext","label":"노트","required":false}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='골프 영상' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '아이 학원 학습 상담', '📚', '#4f46e5', '아이의 학습 상담 내용을 기록합니다.', '[{"key":"academy_name","type":"text","label":"학원이름"},{"key":"consultation_date","type":"date","label":"상담 날짜","required":true},{"key":"subject","type":"multiselect","label":"과목","options":["수학","영어","과학","사회","예술"]},{"key":"issues","type":"longtext","label":"문제점"},{"key":"recommendations","type":"longtext","label":"추천 사항"},{"key":"follow_up_date","type":"date","label":"후속 상담 날짜"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='아이 학원 학습 상담' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '차량 관리', '🚗', '#4caf50', '차량의 정비 및 주행 정보를 관리하는 컬렉션', '[{"key":"field5","type":"text","label":"제목"},{"key":"field6","type":"multiselect","label":"속성","options":["보험","정비","수리"]},{"key":"mileage","type":"longtext","label":"메모","required":true},{"key":"maintenance_date","type":"date","label":"날짜","required":true},{"key":"notes","type":"number","label":"주행거리 (km)","required":false},{"key":"field4","type":"files","label":"첨부"}]'::jsonb, 0, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='차량 관리' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '이쁜말 모음', '💖', '#ff6f61', '따뜻한 마음을 전하는 이쁜말들', '[{"key":"title","type":"text","label":"제목","required":true},{"key":"meaning","type":"longtext","label":"의미","required":true},{"key":"usage_example","type":"longtext","label":"사용 예시","required":false},{"key":"category","type":"select","label":"카테고리","options":["사랑","친구","격려","감사","기타"]},{"key":"field_5","type":"url","label":"출처"}]'::jsonb, 1, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='이쁜말 모음' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '독서 목록', '📚', '#10b981', '읽고 있는/읽을/읽은 책', '[{"key":"title","type":"text","label":"제목","required":true},{"key":"author","type":"text","label":"저자"},{"key":"status","type":"select","label":"상태","options":["읽고 싶은","읽는 중","완독","중단"]},{"key":"rating","type":"rating","label":"별점"},{"key":"started_at","type":"date","label":"시작일"},{"key":"finished_at","type":"date","label":"완독일"},{"key":"review","type":"longtext","label":"한줄평/감상"}]'::jsonb, 2, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='독서 목록' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '경조사', '💐', '#ec4899', '축의금/조의금 등 경조사 기록', '[{"key":"who","type":"text","label":"대상","required":true},{"key":"occasion","type":"select","label":"행사","options":["결혼","돌잔치","장례","환갑","칠순","입학","졸업","기타"]},{"key":"date","type":"date","label":"날짜"},{"key":"amount","type":"currency","label":"금액"},{"key":"direction","type":"select","label":"방향","options":["전달","수령"]},{"key":"memo","type":"longtext","label":"메모"}]'::jsonb, 4, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='경조사' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '레시피', '🍳', '#ef4444', '요리 레시피와 링크 보관', '[{"key":"name","type":"text","label":"이름","required":true},{"key":"category","type":"select","label":"분류","options":["한식","양식","일식","중식","디저트","음료","기타"]},{"key":"url","type":"url","label":"레시피 URL"},{"key":"cook_time","type":"number","label":"조리시간 (분)"},{"key":"rating","type":"rating","label":"평점"},{"key":"ingredients","type":"longtext","label":"재료"},{"key":"cooked_count","type":"rating","label":"요리 횟수","options":["1","2","3","4","5","6","7","8","9","10"]},{"key":"memo","type":"longtext","label":"메모"},{"key":"cooked_dates","type":"longtext","label":"요리일 기록"}]'::jsonb, 5, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='레시피' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '드라마/영화', '🎬', '#8b5cf6', '본 드라마, 영화 기록', '[{"key":"title","type":"text","label":"제목","required":true},{"key":"kind","type":"select","label":"종류","options":["드라마","영화","예능","다큐","애니"]},{"key":"status","type":"select","label":"상태","options":["보고 싶은","보는 중","완료","중단"]},{"key":"rating","type":"rating","label":"별점"},{"key":"genre","type":"multiselect","label":"장르","options":["로맨스","액션","스릴러","코미디","판타지","SF","드라마"]},{"key":"platform","type":"text","label":"플랫폼"},{"key":"review","type":"longtext","label":"한줄평"},{"key":"watch_start_date","type":"date","label":"시청 시작일"},{"key":"watch_end_date","type":"date","label":"시청 종료일"},{"key":"watch_day","type":"multiselect","label":"시청 요일","options":["월","화","수","목","금","토","일"]},{"key":"watch_time","type":"text","label":"방송 시간"},{"key":"main_actor","type":"text","label":"주연배우"},{"key":"quote","type":"longtext","label":"명대사"}]'::jsonb, 6, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='드라마/영화' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '갖고 싶은 것', '🎁', '#3b82f6', '사고 싶은 물건/선물', '[{"key":"name","type":"text","label":"이름","required":true},{"key":"price","type":"currency","label":"가격"},{"key":"url","type":"url","label":"URL"},{"key":"priority","type":"rating","label":"우선순위"},{"key":"bought","type":"checkbox","label":"구매 완료"},{"key":"memo","type":"longtext","label":"메모"}]'::jsonb, 7, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='갖고 싶은 것' AND is_active=true);

INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)
SELECT '00000000-0000-0000-0000-000000000001', '여행 기록', '🌍', '#4caf50', '여행의 추억을 기록하세요.', '[{"key":"title","type":"text","label":"여행지","required":true},{"key":"travel_with","type":"multiselect","label":"함께 간 사람","options":["가족","친구","연인","혼자"]},{"key":"start_date","type":"date","label":"시작 날짜","required":true},{"key":"end_date","type":"date","label":"종료 날짜","required":true},{"key":"duration","type":"text","label":"여행 기간 (일)","required":true},{"key":"field_7","type":"currency","label":"비용"},{"key":"highlights","type":"longtext","label":"하이라이트"}]'::jsonb, 8, 'list', true
WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='00000000-0000-0000-0000-000000000001' AND name='여행 기록' AND is_active=true);

-- ARCHIVE_TEMPLATE_END

-- ============================================================
-- ✅ 완료! 'Success. No rows returned' 가 보이면 정상.
-- 이제 Vercel 배포로 넘어가세요.
-- ============================================================
