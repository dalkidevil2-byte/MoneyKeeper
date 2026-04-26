-- 020: Daily Track Record (DTR)
-- 매일/주기적 단순 체크리스트 — 양치, 약 먹기, 화장실 청소, 칫솔 바꾸기 등
-- 루틴과 달리 캘린더/타임테이블에 노출되지 않음. 오늘 페이지에만 나옴.

CREATE TABLE IF NOT EXISTS daily_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  emoji TEXT DEFAULT '✅',
  category_main TEXT DEFAULT '',
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  target_member_ids UUID[] DEFAULT '{}',

  -- 빈도
  -- target_count: 주기당 목표 횟수 (예: 하루 3번, 주 1번)
  -- period_unit: 'day' | 'week' | 'month'
  target_count INTEGER NOT NULL DEFAULT 1,
  period_unit TEXT NOT NULL DEFAULT 'day'
    CHECK (period_unit IN ('day', 'week', 'month')),

  -- 시작일/종료일 (선택) — 미래 날짜는 표시 안 됨, 종료일 지나면 자동 archive
  start_date DATE,
  end_date DATE,

  is_active BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_tracks_household_active
  ON daily_tracks(household_id, is_active);

DROP TRIGGER IF EXISTS trg_daily_tracks_updated_at ON daily_tracks;
CREATE TRIGGER trg_daily_tracks_updated_at
  BEFORE UPDATE ON daily_tracks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 체크 로그 (날짜별 완료 카운트)
CREATE TABLE IF NOT EXISTS daily_track_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES daily_tracks(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  done_on DATE NOT NULL DEFAULT CURRENT_DATE,
  done_at TIMESTAMPTZ DEFAULT now(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  note TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_daily_track_logs_track_date
  ON daily_track_logs(track_id, done_on);
CREATE INDEX IF NOT EXISTS idx_daily_track_logs_household_date
  ON daily_track_logs(household_id, done_on);
