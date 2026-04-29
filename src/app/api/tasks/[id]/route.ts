export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

// ─────────────────────────────────────────
// GET /api/tasks/[id]
// ─────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const { data: task, error } = await supabase
      .from('tasks')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('id', id)
      .single();

    if (error) throw error;

    // 최근 60일 완료 기록
    const since = dayjs().subtract(60, 'day').format('YYYY-MM-DD');
    const { data: completions } = await supabase
      .from('task_completions')
      .select('*')
      .eq('task_id', id)
      .gte('completed_on', since)
      .order('completed_on', { ascending: false });

    // 체크리스트
    const { data: checklist } = await supabase
      .from('task_checklist_items')
      .select('*')
      .eq('task_id', id)
      .order('position', { ascending: true });

    return NextResponse.json({
      task: {
        ...task,
        completions: completions ?? [],
        checklist: checklist ?? [],
      },
    });
  } catch (error) {
    console.error('[GET /tasks/:id]', error);
    return NextResponse.json({ error: '할일을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// PATCH /api/tasks/[id]
// ─────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json();

    // 허용 필드만 추려서 업데이트
    const allowed = [
      'title',
      'memo',
      'category_main',
      'category_sub',
      'member_id',
      'target_member_ids',
      'is_fixed',
      'due_date',
      'end_date',
      'due_time',
      'end_time',
      'status',
      'snoozed_to',
      'completed_at',
      'priority',
      'recurrence',
      'until_date',
      'until_count',
      'excluded_dates',
      'goal_id',
      'expense_amount',
      'expense_category_main',
      'expense_category_sub',
      'expense_account_id',
      'expense_payment_method_id',
      'expense_transaction_id',
      'kind',
      'start_date',
      'deadline_date',
      'deadline_time',
      'is_active',
      'type',
      'estimated_minutes',
    ] as const;

    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        update[key] = body[key];
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(update)
      .eq('id', id)
      .select(`*, member:members!member_id(id, name, color)`)
      .single();

    if (error) throw error;

    // 구글 캘린더 자동 동기화 (event 만)
    if (data && data.kind === 'event' && data.due_date) {
      try {
        const { pushTaskToGoogle } = await import('@/lib/google-calendar');
        const gid = await pushTaskToGoogle(data.household_id, data as unknown as import('@/types').Task);
        if (gid && gid !== data.google_event_id) {
          await supabase
            .from('tasks')
            .update({ google_event_id: gid, google_synced_at: new Date().toISOString() })
            .eq('id', id);
        } else if (gid) {
          await supabase
            .from('tasks')
            .update({ google_synced_at: new Date().toISOString() })
            .eq('id', id);
        }
      } catch (e) {
        console.warn('[gcal] patch task push 실패', e);
      }
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error('[PATCH /tasks/:id]', error);
    return NextResponse.json({ error: '할일 수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// DELETE /api/tasks/[id] — soft delete
// ─────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    // 삭제 전에 google_event_id, google_calendar_id, household_id 조회
    const { data: prev } = await supabase
      .from('tasks')
      .select('google_event_id, google_calendar_id, household_id, kind')
      .eq('id', id)
      .maybeSingle();

    const { error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', is_active: false })
      .eq('id', id);

    if (error) throw error;

    // 구글 캘린더에서도 삭제 (소속 캘린더 우선, fallback primary)
    if (prev?.google_event_id && prev.household_id) {
      try {
        const { deleteTaskFromGoogle } = await import('@/lib/google-calendar');
        await deleteTaskFromGoogle(
          prev.household_id as string,
          prev.google_event_id as string,
          (prev.google_calendar_id as string | null) ?? null,
        );
      } catch (e) {
        console.warn('[gcal] delete task 실패', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /tasks/:id]', error);
    return NextResponse.json({ error: '할일 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
