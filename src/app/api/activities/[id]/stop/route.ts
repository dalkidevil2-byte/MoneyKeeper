export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/activities/[id]/stop
 * - 진행 중 세션의 end_at = now 으로 update → trigger 가 duration_minutes 자동 계산
 * - goal_id 있으면 goal_progress_events insert (mode='session' → +1, 'hours' → duration/60)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: act } = await supabase
      .from('activities')
      .select('id, household_id, goal_id, goal_count_mode')
      .eq('id', id)
      .maybeSingle();
    if (!act) {
      return NextResponse.json({ error: '활동 없음' }, { status: 404 });
    }

    // 진행 중 세션 찾기
    const { data: running } = await supabase
      .from('activity_sessions')
      .select('*')
      .eq('activity_id', id)
      .is('end_at', null)
      .maybeSingle();
    if (!running) {
      return NextResponse.json({ stopped: false, reason: 'no running session' });
    }

    // 종료
    const { data: stopped, error } = await supabase
      .from('activity_sessions')
      .update({ end_at: new Date().toISOString() })
      .eq('id', running.id)
      .select('*')
      .single();
    if (error) throw error;

    const durationMin = (stopped.duration_minutes as number) ?? 0;

    // 목표 진행 +1 또는 +hours
    if (act.goal_id && durationMin > 0) {
      const mode = (act.goal_count_mode as string) ?? 'session';
      const delta =
        mode === 'hours' ? Math.round((durationMin / 60) * 100) / 100 : 1;
      try {
        const { data: ev } = await supabase
          .from('goal_progress_events')
          .insert({
            goal_id: act.goal_id,
            household_id: act.household_id,
            occurred_on: stopped.session_date,
            delta,
            source: 'activity_session',
            note: `활동 ${durationMin}분`,
          })
          .select('id')
          .single();
        if (ev) {
          await supabase
            .from('activity_sessions')
            .update({ goal_progress_event_id: ev.id })
            .eq('id', stopped.id);
        }
      } catch (e) {
        console.warn('[stop] goal progress fail', e);
      }
    }

    return NextResponse.json({ session: stopped, stopped: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
