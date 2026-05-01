export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { pullEventsToTasks } from '@/lib/google-calendar';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 위험: 일정(event) 전부 비활성화 + google_event_id 매핑 제거 후 재동기화.
 * - kind='event' && is_active=true 인 모든 task → status=cancelled, is_active=false
 * - google_event_id, google_calendar_id 제거 (재 pull 시 새로 매칭되도록)
 * - last_synced_at 리셋
 * - pullEventsToTasks 즉시 실행 → 구글 캘린더에서 일정 새로 가져옴
 *
 * todo, routine 은 건드리지 않음.
 */
export async function POST() {
  const supabase = createServerSupabaseClient();

  // 1) 기존 활성 event 모두 비활성화 + 매핑 제거
  const { data: cleared, error: clearErr } = await supabase
    .from('tasks')
    .update({
      status: 'cancelled',
      is_active: false,
      google_event_id: null,
      google_calendar_id: null,
    })
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('is_active', true)
    .select('id');

  if (clearErr) {
    return NextResponse.json({ error: clearErr.message }, { status: 500 });
  }

  // 2) last_synced_at 리셋
  await supabase
    .from('google_calendar_sync')
    .update({ last_synced_at: null, updated_at: new Date().toISOString() })
    .eq('household_id', HOUSEHOLD_ID);

  // 3) 즉시 pull (구글 → 우리)
  const pulled = await pullEventsToTasks(HOUSEHOLD_ID);

  return NextResponse.json({
    success: true,
    cleared: cleared?.length ?? 0,
    pulled,
  });
}
