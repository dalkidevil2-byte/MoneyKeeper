export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pushTaskToGoogle } from '@/lib/google-calendar';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 이미 동기화된 모든 event 를 다시 push (색상/제목/시간 갱신용).
 * 강제 재반영 — 시간 좀 걸릴 수 있음.
 */
export async function POST() {
  const supabase = createServerSupabaseClient();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, member:members!member_id(id, name, color)')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('is_active', true)
    .neq('status', 'cancelled')
    .not('due_date', 'is', null);

  let updated = 0;
  let failed = 0;
  for (const t of (tasks ?? []) as Task[]) {
    try {
      const gid = await pushTaskToGoogle(HOUSEHOLD_ID, t);
      if (gid) {
        await supabase
          .from('tasks')
          .update({ google_event_id: gid, google_synced_at: new Date().toISOString() })
          .eq('id', t.id);
        updated++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ success: true, updated, failed, total: tasks?.length ?? 0 });
}
