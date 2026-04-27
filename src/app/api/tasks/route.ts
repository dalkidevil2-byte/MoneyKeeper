export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { CreateTaskInput } from '@/types';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// ─────────────────────────────────────────
// GET /api/tasks
// query: from, to, status, member_id, type, category_main, include_cancelled
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);

  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const status = searchParams.get('status');
  const memberId = searchParams.get('member_id');
  const type = searchParams.get('type');
  const kind = searchParams.get('kind');
  const categoryMain = searchParams.get('category_main');
  const includeCancelled = searchParams.get('include_cancelled') === '1';
  const includeCompletions = searchParams.get('include_completions') === '1';

  try {
    const selectClause = includeCompletions
      ? `*, member:members!member_id(id, name, color), completions:task_completions(id, completed_on, completed_at, member_id)`
      : `*, member:members!member_id(id, name, color)`;

    let query = supabase
      .from('tasks')
      .select(selectClause)
      .eq('household_id', householdId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('due_time', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (!includeCancelled) query = query.neq('status', 'cancelled');
    if (status) query = query.eq('status', status);
    if (memberId) {
      // 본인 + 다중 담당에 포함 + 공유(담당 없음) 모두 포함
      query = query.or(
        `member_id.eq.${memberId},target_member_ids.cs.{${memberId}},member_id.is.null`
      );
    }
    if (type) query = query.eq('type', type);
    if (kind) query = query.eq('kind', kind);
    if (categoryMain) query = query.eq('category_main', categoryMain);
    if (from) query = query.gte('due_date', from);
    if (to) query = query.lte('due_date', to);

    const { data, error } = await query;
    if (error) throw error;

    // 카드 미리보기용 — todo 일 때만 체크리스트 + 작업 세션 시간 합산
    const tasksData = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const checklistMap: Record<
      string,
      { total: number; done: number; total_minutes: number }
    > = {};
    const sessionMap: Record<string, number> = {}; // task_id → total minutes
    if (kind === 'todo' && tasksData.length > 0) {
      const ids = tasksData.map((t) => t.id as string);
      const { data: items } = await supabase
        .from('task_checklist_items')
        .select('task_id, is_done, estimated_minutes')
        .in('task_id', ids);
      for (const it of items ?? []) {
        const key = it.task_id as string;
        if (!checklistMap[key]) {
          checklistMap[key] = { total: 0, done: 0, total_minutes: 0 };
        }
        checklistMap[key].total += 1;
        if (it.is_done) checklistMap[key].done += 1;
        const m = (it.estimated_minutes as number | null) ?? 0;
        if (m > 0) checklistMap[key].total_minutes += m;
      }

      const { data: sessions } = await supabase
        .from('task_work_sessions')
        .select('task_id, start_time, end_time')
        .in('task_id', ids);
      for (const s of sessions ?? []) {
        const start = s.start_time as string | null;
        const end = s.end_time as string | null;
        if (!start || !end) continue;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const minutes = eh * 60 + em - (sh * 60 + sm);
        if (minutes <= 0) continue;
        const tid = s.task_id as string;
        sessionMap[tid] = (sessionMap[tid] ?? 0) + minutes;
      }
    }
    const enriched = tasksData.map((t) => ({
      ...t,
      checklist_summary: checklistMap[t.id as string] ?? null,
      session_total_minutes: sessionMap[t.id as string] ?? 0,
    }));

    return NextResponse.json({ tasks: enriched });
  } catch (error) {
    console.error('[GET /tasks]', error);
    return NextResponse.json({ error: '할일 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST /api/tasks
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const body: CreateTaskInput = await req.json();

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
    }
    if (body.type === 'routine' && !body.recurrence) {
      return NextResponse.json({ error: '루틴은 반복 규칙이 필요합니다.' }, { status: 400 });
    }
    if (body.is_fixed && !body.due_time) {
      return NextResponse.json({ error: '시간 지정 일정은 시작 시간이 필요합니다.' }, { status: 400 });
    }
    // 종료일 < 시작일 방지
    if (body.due_date && body.end_date && body.end_date < body.due_date) {
      return NextResponse.json({ error: '종료일이 시작일보다 빠를 수 없습니다.' }, { status: 400 });
    }

    const targetIds: string[] = Array.isArray(body.target_member_ids)
      ? body.target_member_ids.filter(Boolean)
      : [];

    const insertData = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      kind: body.kind ?? 'event',
      start_date: body.start_date ?? null,
      deadline_date: body.deadline_date ?? null,
      deadline_time: body.deadline_time ?? null,
      type: body.type ?? 'one_time',
      title: body.title.trim(),
      memo: body.memo ?? '',
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      member_id: body.member_id ?? null,
      target_member_ids: targetIds,
      is_fixed: body.is_fixed ?? false,
      due_date: body.due_date ?? null,
      end_date: body.end_date ?? null,
      due_time: body.due_time ?? null,
      end_time: body.end_time ?? null,
      priority: body.priority ?? 'normal',
      recurrence: body.recurrence ?? null,
      until_date: body.until_date ?? null,
      until_count: body.until_count ?? null,
      goal_id: body.goal_id ?? null,
      expense_amount: body.expense_amount ?? null,
      expense_category_main: body.expense_category_main ?? '',
      expense_category_sub: body.expense_category_sub ?? '',
      expense_account_id: body.expense_account_id ?? null,
      expense_payment_method_id: body.expense_payment_method_id ?? null,
      status: 'pending' as const,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('tasks')
      .insert(insertData)
      .select(`*, member:members!member_id(id, name, color)`)
      .single();

    if (error) throw error;

    return NextResponse.json({ task: data }, { status: 201 });
  } catch (error) {
    console.error('[POST /tasks]', error);
    return NextResponse.json({ error: '할일 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
