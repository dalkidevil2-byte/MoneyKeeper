export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/archive/entries/[id]/linked-tasks
 * 이 아카이브 항목과 연결된 할일/일정 목록.
 * tasks.archive_links @> [{entry_id: 이ID}] 조건으로 조회.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: entryId } = await params;
  const supabase = createServerSupabaseClient();

  try {
    // jsonb 의 @> contains 연산자 사용
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'id, title, kind, type, status, due_date, due_time, deadline_date, completed_at, completions, member:members!member_id(id,name,color)',
      )
      .filter('archive_links', 'cs', JSON.stringify([{ entry_id: entryId }]))
      .neq('status', 'cancelled')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ tasks: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패', tasks: [] },
      { status: 500 },
    );
  }
}
