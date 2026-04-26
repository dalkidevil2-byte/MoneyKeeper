export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/todo/notifications
// 지금 시각 기준으로 고정 일정 중 알림 시점이 도래한 (또는 지난 30분 안의) 일정 목록 반환.
// 각 lead_minutes 마다 한 번씩 잡되, 중복 제거.
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    // 설정 조회
    const { data: settings } = await supabase
      .from('todo_notification_settings')
      .select('*')
      .eq('household_id', householdId)
      .maybeSingle();
    if (settings && settings.enabled === false) {
      return NextResponse.json({ notifications: [] });
    }
    const leadMinutes: number[] =
      settings?.lead_minutes && Array.isArray(settings.lead_minutes)
        ? settings.lead_minutes
        : [30];

    // 오늘 + 내일 시간 일정 조회 (전날 알림 처리 위해 내일까지)
    const today = dayjs().format('YYYY-MM-DD');
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');

    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id, title, due_date, due_time, end_time,
        member_id, target_member_ids,
        category_main, category_sub,
        status,
        member:members!member_id(id, name, color)
      `)
      .eq('household_id', householdId)
      .neq('status', 'cancelled')
      .eq('is_active', true)
      .eq('is_fixed', true)
      .in('due_date', [today, tomorrow]);

    const now = dayjs();
    const out: Array<{
      task_id: string;
      title: string;
      due_at: string;
      lead_minutes: number;
      remaining_min: number;
      member?: { id: string; name: string; color: string };
    }> = [];

    for (const t of tasks ?? []) {
      if (t.status === 'done') continue;
      if (!t.due_date || !t.due_time) continue;
      // 시각 결합
      const time = (t.due_time as string).slice(0, 8); // HH:mm:ss
      const dueAt = dayjs(`${t.due_date}T${time}`);
      const diffMin = dueAt.diff(now, 'minute');
      // 가까운 lead 매칭 — diff 가 lead 분 이하 + due 가 안 지났어야 함
      // (diff = 음수면 지난 일정 — 알림 안 보냄)
      if (diffMin < 0) continue;
      // 가장 큰 lead 안에 들어오면 알림
      const maxLead = Math.max(...leadMinutes, 0);
      if (diffMin > maxLead) continue;
      // 어떤 lead 매칭?
      const matchedLead =
        leadMinutes
          .filter((m) => diffMin <= m)
          .sort((a, b) => a - b)[0] ?? 0;

      const memberRaw = (t as { member?: unknown }).member;
      const member = Array.isArray(memberRaw)
        ? (memberRaw[0] as { id: string; name: string; color: string } | undefined)
        : (memberRaw as { id: string; name: string; color: string } | undefined);

      out.push({
        task_id: t.id as string,
        title: t.title as string,
        due_at: dueAt.toISOString(),
        lead_minutes: matchedLead,
        remaining_min: diffMin,
        member: member
          ? { id: member.id, name: member.name, color: member.color }
          : undefined,
      });
    }

    out.sort((a, b) => a.remaining_min - b.remaining_min);
    return NextResponse.json({ notifications: out });
  } catch (error: any) {
    console.error('[GET notifications]', error);
    return NextResponse.json({ error: '알림 조회 실패' }, { status: 500 });
  }
}
