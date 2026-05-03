export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/archive/collections/[id]/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 이 컬렉션의 항목들과 연결된 활동 세션을 기간 내에서 조회.
 * 캘린더 뷰에서 entry 별 활동 시간을 시각화하기 위해 사용.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: collectionId } = await params;
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  try {
    let q = supabase
      .from('activity_sessions')
      .select(
        'id, archive_links, session_date, start_at, end_at, duration_minutes, activity:activities(id, name, emoji, color)',
      )
      .filter('archive_links', 'cs', JSON.stringify([{ collection_id: collectionId }]))
      .order('start_at', { ascending: true });
    if (from) q = q.gte('session_date', from);
    if (to) q = q.lte('session_date', to);
    const { data, error } = await q.limit(500);
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패', sessions: [] },
      { status: 500 },
    );
  }
}
