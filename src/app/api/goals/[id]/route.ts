export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: goal, error } = await supabase
      .from('goals')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('id', id)
      .single();
    if (error) throw error;
    const { data: events } = await supabase
      .from('goal_progress_events')
      .select('*')
      .eq('goal_id', id)
      .order('occurred_on', { ascending: false });

    // 이 목표에 연결된 활성 할일/루틴
    const { data: linkedTasks } = await supabase
      .from('tasks')
      .select(`id, title, type, is_fixed, due_date, due_time, recurrence,
               member:members!member_id(id, name, color)`)
      .eq('goal_id', id)
      .neq('status', 'cancelled')
      .eq('is_active', true)
      .order('type', { ascending: true })
      .order('due_date', { ascending: true });

    return NextResponse.json({
      goal: { ...goal, events: events ?? [], linked_tasks: linkedTasks ?? [] },
    });
  } catch (error: any) {
    console.error('[GET /goals/:id]', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const allowed = [
      'title', 'memo', 'emoji', 'category_main',
      'member_id', 'target_member_ids',
      'freq_count', 'freq_period',
      'target_value', 'unit',
      'start_date', 'due_date',
      'status', 'completed_at',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('goals')
      .update(update)
      .eq('id', id)
      .select(`*, member:members!member_id(id, name, color)`)
      .single();
    if (error) throw error;
    return NextResponse.json({ goal: data });
  } catch (error: any) {
    console.error('[PATCH /goals/:id]', error);
    return NextResponse.json({ error: '수정 실패' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase.from('goals').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE /goals/:id]', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
