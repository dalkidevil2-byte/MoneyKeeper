export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pullEventsToTasks, pushTaskToGoogle } from '@/lib/google-calendar';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const THROTTLE_MIN = 10;

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
  let candidates = 0;
  const failures: string[] = [];
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

    candidates = (needsPush ?? []).length;

    for (const t of (needsPush ?? []) as Task[]) {
      try {
        const gid = await pushTaskToGoogle(HOUSEHOLD_ID, t);
        if (gid) {
          await supabase
            .from('tasks')
            .update({ google_event_id: gid, google_synced_at: new Date().toISOString() })
            .eq('id', t.id);
          pushed++;
        } else {
          // 예외 없이 null 이 오는 경우 — 인증 실패나 변환 불가
          failures.push(`${t.title}: 이벤트를 만들지 못함`);
        }
      } catch (e) {
        failures.push(`${t.title}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    failures.push(`대상 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  const pullResult = await pullEventsToTasks(HOUSEHOLD_ID);

  // 실패를 조용히 삼키면 몇 주씩 안 올라간 걸 모르게 된다. 응답과 로그에 남긴다.
  if (failures.length) console.error('[gcal auto-sync] push 실패', failures);

  return NextResponse.json({
    status: 'ok',
    candidates,
    pushed,
    failed: failures.length,
    errors: failures.slice(0, 5),
    pulled: pullResult,
  });
}
