export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 지나간 일정(event)을 일괄 완료 처리.
 * - kind='event' && type='one_time' && status='pending'
 * - end_date(또는 due_date) < 오늘
 * - completed_at 은 그 일정의 종료일로 기록
 *
 * 루틴(routine) 은 건드리지 않음 — 회차 단위로 별도 관리되므로.
 * 할일(todo) 도 건드리지 않음 — 사용자가 의도해서 미완료로 둔 것일 수 있음.
 */
export async function POST() {
  const supabase = createServerSupabaseClient();
  const today = dayjs().format('YYYY-MM-DD');

  // 대상: event + one_time + pending + 종료일 < 오늘
  const { data: targets } = await supabase
    .from('tasks')
    .select('id, due_date, end_date, due_time, end_time')
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('type', 'one_time')
    .eq('status', 'pending')
    .eq('is_active', true)
    .not('due_date', 'is', null);

  let updated = 0;
  for (const t of targets ?? []) {
    const endDate = (t.end_date as string | null) ?? (t.due_date as string);
    if (!endDate || endDate >= today) continue;
    const endTime = (t.end_time as string | null) ?? (t.due_time as string | null) ?? '23:59:00';
    const completedAt = `${endDate}T${endTime}+09:00`;
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'done',
        completed_at: completedAt,
      })
      .eq('id', t.id);
    if (!error) updated++;
  }

  return NextResponse.json({ success: true, updated });
}
