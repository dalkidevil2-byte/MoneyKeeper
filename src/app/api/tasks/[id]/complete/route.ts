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

    // 작업 정보 조회 (type, goal_id, 비용 정보 알아야 함)
    const { data: task, error: fetchErr } = await supabase
      .from('tasks')
      .select(`id, type, kind, title, household_id, member_id, goal_id,
               expense_amount, expense_category_main, expense_category_sub,
               expense_account_id, expense_payment_method_id, expense_transaction_id`)
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

    // 가계부 자동 거래 생성 — 비용 입력돼있고 아직 transaction 없으면
    if (
      task.expense_amount &&
      task.expense_amount > 0 &&
      !task.expense_transaction_id
    ) {
      try {
        const { data: trx } = await supabase
          .from('transactions')
          .insert({
            household_id: householdId,
            member_id: task.member_id ?? null,
            date: completedOn,
            type: 'variable_expense' as const,
            amount: task.expense_amount,
            name: task.title,
            merchant_name: '',
            account_from_id: task.expense_account_id ?? null,
            payment_method_id: task.expense_payment_method_id ?? null,
            category_main: task.expense_category_main ?? '',
            category_sub: task.expense_category_sub ?? '',
            memo: `[${task.kind === 'todo' ? '할일' : '일정'}] 자동 등록`,
            input_type: 'manual' as const,
            status: 'reviewed' as const,
            sync_status: 'pending' as const,
          })
          .select('id')
          .single();
        if (trx) {
          await supabase
            .from('tasks')
            .update({ expense_transaction_id: trx.id })
            .eq('id', id);
        }
      } catch (err) {
        console.error('[task expense → transaction]', err);
      }
    }

    // 목표 자동 집계 — task 가 goal 에 연결돼 있으면 progress event 추가
    if (task.goal_id && completion) {
      const { error: progErr } = await supabase
        .from('goal_progress_events')
        .upsert(
          {
            goal_id: task.goal_id,
            household_id: householdId,
            occurred_on: completedOn,
            delta: 1,
            source: task.type === 'routine' ? 'routine_completion' : 'task_completion',
            task_id: id,
            task_completion_id: completion.id,
          },
          { onConflict: 'goal_id,task_completion_id' },
        );
      if (progErr) console.error('[goal auto-progress]', progErr);
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
    // 삭제 전에 completion id 확보 → 연관 progress event 도 정리
    const { data: existing } = await supabase
      .from('task_completions')
      .select('id')
      .eq('task_id', id)
      .eq('completed_on', date)
      .maybeSingle();

    const { error } = await supabase
      .from('task_completions')
      .delete()
      .eq('task_id', id)
      .eq('completed_on', date);
    if (error) throw error;

    if (existing) {
      await supabase
        .from('goal_progress_events')
        .delete()
        .eq('task_completion_id', existing.id);
    }

    // 비용 거래도 cancel (해당 task 의 transaction 이 있으면)
    const { data: tk } = await supabase
      .from('tasks')
      .select('expense_transaction_id')
      .eq('id', id)
      .maybeSingle();
    if (tk?.expense_transaction_id) {
      await supabase
        .from('transactions')
        .update({ status: 'cancelled' })
        .eq('id', tk.expense_transaction_id);
      await supabase
        .from('tasks')
        .update({ expense_transaction_id: null })
        .eq('id', id);
    }

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
