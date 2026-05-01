export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// DELETE /api/activities/sessions/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    // 연결된 progress event / daily track log 도 함께 정리
    const { data: sess } = await supabase
      .from('activity_sessions')
      .select('goal_progress_event_id, daily_track_log_id')
      .eq('id', id)
      .maybeSingle();
    if (sess?.goal_progress_event_id) {
      await supabase
        .from('goal_progress_events')
        .delete()
        .eq('id', sess.goal_progress_event_id);
    }
    if (sess?.daily_track_log_id) {
      // 같은 track 의 같은 날짜에 다른 세션이 있으면 log 유지, 없으면 삭제
      const { data: others } = await supabase
        .from('activity_sessions')
        .select('id')
        .eq('daily_track_log_id', sess.daily_track_log_id)
        .neq('id', id);
      if (!others || others.length === 0) {
        await supabase
          .from('daily_track_logs')
          .delete()
          .eq('id', sess.daily_track_log_id);
      }
    }
    const { error } = await supabase
      .from('activity_sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
