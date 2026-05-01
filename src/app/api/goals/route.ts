export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import type { CreateGoalInput, Goal } from '@/types';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 목록 + current_value/progress_rate 계산
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const status = searchParams.get('status');

  try {
    let q = supabase
      .from('goals')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('household_id', householdId)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const { data: goals, error } = await q;
    if (error) throw error;

    const goalIds = (goals ?? []).map((g) => g.id as string);
    if (goalIds.length === 0) return NextResponse.json({ goals: [] });

    // 진행 이벤트 합계 계산
    const { data: events } = await supabase
      .from('goal_progress_events')
      .select('goal_id, occurred_on, delta')
      .in('goal_id', goalIds);

    // 연결된 활성 task 개수 + 작업 시간 합산
    const { data: linkRows } = await supabase
      .from('tasks')
      .select('id, goal_id')
      .in('goal_id', goalIds)
      .neq('status', 'cancelled')
      .eq('is_active', true);
    const linkedCount = new Map<string, number>();
    const taskToGoal = new Map<string, string>();
    for (const r of linkRows ?? []) {
      if (!r.goal_id) continue;
      linkedCount.set(r.goal_id as string, (linkedCount.get(r.goal_id as string) ?? 0) + 1);
      taskToGoal.set(r.id as string, r.goal_id as string);
    }
    // 작업 세션 시간 → 목표별 합산
    const goalTimeMap = new Map<string, number>();
    if (taskToGoal.size > 0) {
      const taskIds = Array.from(taskToGoal.keys());
      const { data: sessions } = await supabase
        .from('task_work_sessions')
        .select('task_id, start_time, end_time')
        .in('task_id', taskIds);
      for (const s of sessions ?? []) {
        const start = s.start_time as string | null;
        const end = s.end_time as string | null;
        if (!start || !end) continue;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        const m = eh * 60 + em - (sh * 60 + sm);
        if (m <= 0) continue;
        const gid = taskToGoal.get(s.task_id as string);
        if (gid) goalTimeMap.set(gid, (goalTimeMap.get(gid) ?? 0) + m);
      }
    }

    const enriched = (goals ?? []).map((g): Goal => {
      const goalEvents = (events ?? []).filter((e) => e.goal_id === g.id);
      const current = computeCurrentValue(g, goalEvents);
      const target = computeTargetValue(g);
      const rate = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
      return {
        ...(g as Goal),
        current_value: current,
        progress_rate: rate,
        linked_task_count: linkedCount.get(g.id as string) ?? 0,
        time_total_minutes: goalTimeMap.get(g.id as string) ?? 0,
      };
    });

    return NextResponse.json({ goals: enriched });
  } catch (error) {
    console.error('[GET /goals]', error);
    return NextResponse.json({ error: '목표 조회 실패' }, { status: 500 });
  }
}

// POST — 생성
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body: CreateGoalInput = await req.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
    }
    if (body.type === 'frequency' && (!body.freq_count || !body.freq_period)) {
      return NextResponse.json(
        { error: '빈도 목표는 횟수와 주기가 필요합니다.' },
        { status: 400 },
      );
    }
    if (body.type === 'quantitative' && (body.target_value == null || body.target_value <= 0)) {
      return NextResponse.json(
        { error: '성취 목표는 목표치가 필요합니다.' },
        { status: 400 },
      );
    }

    const targetIds = Array.isArray(body.target_member_ids)
      ? body.target_member_ids.filter(Boolean)
      : [];

    const insert = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      type: body.type,
      title: body.title.trim(),
      memo: body.memo ?? '',
      emoji: body.emoji ?? '🎯',
      category_main: body.category_main ?? '',
      member_id: body.member_id ?? null,
      target_member_ids: targetIds,
      freq_count: body.type === 'frequency' ? body.freq_count ?? null : null,
      freq_period: body.type === 'frequency' ? body.freq_period ?? null : null,
      target_value: body.type === 'quantitative' ? body.target_value ?? null : null,
      unit: body.unit ?? '',
      start_date: body.start_date ?? null,
      due_date: body.due_date ?? null,
      status: 'active' as const,
    };
    const { data, error } = await supabase
      .from('goals')
      .insert(insert)
      .select(`*, member:members!member_id(id, name, color)`)
      .single();
    if (error) throw error;
    return NextResponse.json({ goal: data }, { status: 201 });
  } catch (error: any) {
    console.error('[POST /goals]', error);
    return NextResponse.json(
      { error: error?.message ?? '저장 실패' },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────
// 진행률 계산
// ─────────────────────────────────────────
function computeCurrentValue(g: any, events: { occurred_on: string; delta: number }[]): number {
  if (g.type === 'frequency') {
    // 현재 주기(day/week/month) 안의 이벤트만 합산
    const period = g.freq_period as 'day' | 'week' | 'month';
    const start =
      period === 'day'
        ? dayjs().startOf('day')
        : period === 'week'
          ? dayjs().startOf('week')
          : dayjs().startOf('month');
    const end =
      period === 'day'
        ? dayjs().endOf('day')
        : period === 'week'
          ? dayjs().endOf('week')
          : dayjs().endOf('month');
    return events
      .filter((e) => {
        const d = dayjs(e.occurred_on);
        return (d.isSame(start, 'day') || d.isAfter(start)) && (d.isSame(end, 'day') || d.isBefore(end));
      })
      .reduce((s, e) => s + Number(e.delta), 0);
  }
  if (g.type === 'quantitative') {
    return events.reduce((s, e) => s + Number(e.delta), 0);
  }
  // deadline — 진행률 = 일수 비율(보조)
  if (g.start_date && g.due_date) {
    const start = dayjs(g.start_date);
    const end = dayjs(g.due_date);
    const total = end.diff(start, 'day') || 1;
    const elapsed = Math.max(0, Math.min(total, dayjs().diff(start, 'day')));
    return elapsed;
  }
  return 0;
}

function computeTargetValue(g: any): number {
  if (g.type === 'frequency') return Number(g.freq_count ?? 0);
  if (g.type === 'quantitative') return Number(g.target_value ?? 0);
  if (g.type === 'deadline') {
    if (g.start_date && g.due_date) {
      return Math.max(1, dayjs(g.due_date).diff(dayjs(g.start_date), 'day'));
    }
    return 1;
  }
  return 0;
}
