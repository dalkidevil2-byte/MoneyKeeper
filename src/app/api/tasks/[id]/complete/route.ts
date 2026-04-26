export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// ─────────────────────────────────────────
// POST /api/tasks/[id]/complete
// body: { completed_on?: 'YYYY-MM-DD', member_id?, note? }
//
// one_time: status=done, completed_at=now, + completion 한 줄
// routine : task_completions upsert (UNIQUE on task_id + completed_on)
// ─────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json().catch(() => ({}));
    const completedOn: string = body.completed_on ?? dayjs().format('YYYY-MM-DD');
    const memberId: string | null = body.member_id ?? null;
    const note: string = body.note ?? '';

    // 작업 정보 조회 (type 알아야 함)
    const { data: task, error: fetchErr } = await supabase
      .from('tasks')
      .select('id, type, household_id, member_id')
      .eq('id', id)
      .single();
    if (fetchErr || !task) {
      return NextResponse.json({ error: '할일을 찾을 수 없습니다.' }, { status: 404 });
    }

    const householdId: string = task.household_id ?? DEFAULT_HOUSEHOLD_ID;

    // completion upsert (UNIQUE)
    const { data: completion, error: upsertErr } = await supabase
      .from('task_completions')
      .upsert(
        {
          task_id: id,
          household_id: householdId,
          completed_on: completedOn,
          completed_at: new Date().toISOString(),
          member_id: memberId ?? task.member_id ?? null,
          note,
        },
        { onConflict: 'task_id,completed_on' }
      )
      .select()
      .single();
    if (upsertErr) throw upsertErr;

    // one_time이면 task의 status도 done으로
    if (task.type === 'one_time') {
      await supabase
        .from('tasks')
        .update({ status: 'done', completed_at: new Date().toISOString() })
        .eq('id', id);
    }

    return NextResponse.json({ completion });
  } catch (error) {
    console.error('[POST /tasks/:id/complete]', error);
    return NextResponse.json({ error: '완료 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// DELETE /api/tasks/[id]/complete?date=YYYY-MM-DD
// 해당 날짜의 완료 기록 삭제 (체크 해제). one_time은 status를 pending으로 되돌림.
// ─────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') ?? dayjs().format('YYYY-MM-DD');

  try {
    const { error } = await supabase
      .from('task_completions')
      .delete()
      .eq('task_id', id)
      .eq('completed_on', date);
    if (error) throw error;

    const { data: task } = await supabase
      .from('tasks')
      .select('type, status')
      .eq('id', id)
      .single();
    if (task?.type === 'one_time') {
      await supabase
        .from('tasks')
        .update({ status: 'pending', completed_at: null })
        .eq('id', id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /tasks/:id/complete]', error);
    return NextResponse.json({ error: '완료 취소 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
