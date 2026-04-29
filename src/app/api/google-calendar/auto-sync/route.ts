export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pullEventsToTasks, pushTaskToGoogle } from '@/lib/google-calendar';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const THROTTLE_MIN = 1;

/**
 * 페이지 진입 시 호출되는 자동 sync.
 * - last_synced_at 이 THROTTLE_MIN 분 미만이면 skip
 * - 그 외엔 push (밀린 거) + pull 실행
 */
export async function POST() {
  const supabase = createServerSupabaseClient();
  const { data: sync } = await supabase
    .from('google_calendar_sync')
    .select('is_active, last_synced_at')
    .eq('household_id', HOUSEHOLD_ID)
    .maybeSingle();

  if (!sync || !sync.is_active) {
    return NextResponse.json({ status: 'not_connected' });
  }

  if (sync.last_synced_at) {
    const last = new Date(sync.last_synced_at).getTime();
    const diffMin = (Date.now() - last) / 60000;
    if (diffMin < THROTTLE_MIN) {
      return NextResponse.json({ status: 'throttled', diffMin });
    }
  }

  let pushed = 0;
  try {
    const { data: needsPush } = await supabase
      .from('tasks')
      .select('*, member:members!member_id(id, name, color)')
      .eq('household_id', HOUSEHOLD_ID)
      .eq('kind', 'event')
      .eq('is_active', true)
      .neq('status', 'cancelled')
      .is('google_event_id', null)
      .not('due_date', 'is', null);

    for (const t of (needsPush ?? []) as Task[]) {
      try {
        const gid = await pushTaskToGoogle(HOUSEHOLD_ID, t);
        if (gid) {
          await supabase
            .from('tasks')
            .update({ google_event_id: gid, google_synced_at: new Date().toISOString() })
            .eq('id', t.id);
          pushed++;
        }
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }

  const pullResult = await pullEventsToTasks(HOUSEHOLD_ID);

  return NextResponse.json({
    status: 'ok',
    pushed,
    pulled: pullResult,
  });
}
