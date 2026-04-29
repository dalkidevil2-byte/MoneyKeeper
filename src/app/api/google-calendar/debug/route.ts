export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getAccessToken, fetchEventsFromGoogle } from '@/lib/google-calendar';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 진단 정보 — 어디서 막히는지 확인용.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const debug: Record<string, unknown> = {};

  // 1. 연결 상태
  const { data: sync } = await supabase
    .from('google_calendar_sync')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .maybeSingle();
  debug.sync_record = !!sync;
  debug.is_active = sync?.is_active;
  debug.has_refresh_token = !!sync?.refresh_token;
  debug.last_synced_at = sync?.last_synced_at;

  if (!sync || !sync.is_active) {
    return NextResponse.json({ error: '연결 안 됨', debug });
  }

  // 2. access token
  try {
    const auth = await getAccessToken(HOUSEHOLD_ID);
    debug.has_access_token = !!auth;
  } catch (e) {
    debug.access_token_error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'token 실패', debug });
  }

  // 3. fetchEvents
  try {
    const result = await fetchEventsFromGoogle(HOUSEHOLD_ID);
    debug.fetch_result = !!result;
    debug.events_count = result?.events.length ?? 0;
    if (result?.events.length) {
      // 처음 3개 샘플
      debug.first_events = result.events.slice(0, 3).map((e) => ({
        id: e.id,
        summary: e.summary,
        start: e.start,
        status: e.status,
        recurringEventId: e.recurringEventId,
        _calendarId: (e as { _calendarId?: string })._calendarId,
      }));
      // 6월 이후 일정 갯수
      const juneCount = result.events.filter((e) => {
        const d = e.start?.date ?? e.start?.dateTime ?? '';
        return d >= '2026-06-01' && d < '2026-07-01';
      }).length;
      debug.june_2026_count = juneCount;
    }
  } catch (e) {
    debug.fetch_error = e instanceof Error ? e.message : String(e);
  }

  // 4. tasks 컬럼 확인 — google_calendar_id 가 select 가능한지
  try {
    const { error } = await supabase
      .from('tasks')
      .select('id, google_calendar_id')
      .eq('household_id', HOUSEHOLD_ID)
      .limit(1);
    debug.google_calendar_id_column_ok = !error;
    if (error) debug.column_error = error.message;
  } catch (e) {
    debug.column_check_error = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ ok: true, debug });
}
