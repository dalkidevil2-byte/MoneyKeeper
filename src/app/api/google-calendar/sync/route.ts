export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { pullEventsToTasks, pushTaskToGoogle } from '@/lib/google-calendar';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// POST /api/google-calendar/sync
// 1) 우리 → 구글: google_event_id 없는 활성 일정 push
// 2) 구글 → 우리: 변경된 이벤트 pull
export async function POST() {
  const supabase = createServerSupabaseClient();

  // 1) push: kind=event, due_date 있고, google_event_id 비어있는 활성 task
  const { data: needsPush } = await supabase
    .from('tasks')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('is_active', true)
    .neq('status', 'cancelled')
    .is('google_event_id', null)
    .not('due_date', 'is', null);

  let pushed = 0;
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
    } catch (e) {
      console.warn('[gcal sync] push 실패', t.id, e);
    }
  }

  // 2) pull
  const pullResult = await pullEventsToTasks(HOUSEHOLD_ID);

  return NextResponse.json({
    success: true,
    pushed,
    pulled: pullResult,
  });
}
