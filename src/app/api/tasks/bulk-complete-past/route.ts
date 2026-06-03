export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 지나간 일정(event)을 자동 완료 처리.
 * - 대상: kind='event' && type='one_time' && status='pending' && is_active
 * - 시간 지정 일정(is_fixed=true): 종료 일시(end_date/due_date + end_time/due_time)가
 *   현재(KST)보다 과거이면 완료 → 같은 날 이미 지난 일정도 처리됨.
 * - 종일 일정(is_fixed=false): 종료일이 어제 이전이면 완료(오늘 종일 일정은 유지).
 * - completed_at 은 그 일정의 종료 일시로 기록.
 *
 * 루틴(routine) 은 회차 단위로 별도 관리되므로 건드리지 않음.
 * 할일(todo) 도 사용자가 의도해서 미완료로 둔 것일 수 있어 건드리지 않음.
 *
 * GET/POST 둘 다 지원 (cron 은 GET, 앱 진입 시 fire-and-forget 은 POST).
 */
async function run() {
  const supabase = createServerSupabaseClient();

  const nowMs = Date.now();
  // KST 기준 오늘 (YYYY-MM-DD) — 종일 일정 비교용
  const todayKST = new Date(nowMs + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: targets } = await supabase
    .from('tasks')
    .select('id, due_date, end_date, due_time, end_time, is_fixed')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('type', 'one_time')
    .eq('status', 'pending')
    .eq('is_active', true)
    .not('due_date', 'is', null);

  let updated = 0;
  for (const t of targets ?? []) {
    const endDate = (t.end_date as string | null) ?? (t.due_date as string | null);
    if (!endDate) continue;

    const isFixed = t.is_fixed === true;
    let isPast: boolean;
    let completedAt: string;

    if (isFixed) {
      // 시간 지정 일정: 종료 일시가 현재보다 과거인가
      const endTime =
        (t.end_time as string | null) ?? (t.due_time as string | null) ?? '23:59:00';
      completedAt = `${endDate}T${endTime}+09:00`;
      const endMs = new Date(completedAt).getTime();
      isPast = Number.isFinite(endMs) && endMs <= nowMs;
    } else {
      // 종일 일정: 종료일이 오늘보다 이전이면 완료
      isPast = endDate < todayKST;
      completedAt = `${endDate}T23:59:00+09:00`;
    }

    if (!isPast) continue;

    const { error } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at: completedAt })
      .eq('id', t.id);
    if (!error) updated++;
  }

  return NextResponse.json({ success: true, updated });
}

export async function POST() {
  return run();
}

export async function GET() {
  return run();
}
