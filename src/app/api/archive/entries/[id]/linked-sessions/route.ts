export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/archive/entries/[id]/linked-sessions
 * 이 아카이브 항목과 연결된 활동 세션 목록.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: entryId } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('activity_sessions')
      .select(
        'id, session_date, start_at, end_at, duration_minutes, note, activity:activities(id, name, emoji)',
      )
      .filter('archive_links', 'cs', JSON.stringify([{ entry_id: entryId }]))
      .order('start_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패', sessions: [] },
      { status: 500 },
    );
  }
}
