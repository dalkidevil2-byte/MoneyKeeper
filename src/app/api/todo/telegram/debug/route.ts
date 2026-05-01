export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET() {
  const supabase = createServerSupabaseClient();
  const debug: Record<string, unknown> = {};

  // 1. 알림 설정
  const { data: notif } = await supabase
    .from('todo_notification_settings')
    .select('*')
    .eq('household_id', HOUSEHOLD_ID)
    .maybeSingle();
  debug.notif_enabled = notif?.enabled ?? '(no row)';
  debug.lead_minutes = notif?.lead_minutes ?? '(no row)';

  // 2. 텔레그램 설정
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('enabled, bot_token')
    .eq('household_id', HOUSEHOLD_ID)
    .maybeSingle();
  debug.tg_enabled = tg?.enabled ?? '(no row)';
  debug.has_bot_token = !!tg?.bot_token;

  // 3. 멤버 chat_id
  const { data: members } = await supabase
    .from('members')
    .select('id, name, telegram_chat_id, is_active')
    .eq('household_id', HOUSEHOLD_ID);
  debug.members_with_chat_id = (members ?? [])
    .filter((m) => m.telegram_chat_id && m.is_active)
    .map((m) => ({ name: m.name, chat_id: m.telegram_chat_id }));

  // 4. 오늘+내일 시간 일정 + 매칭 분석
  const today = dayjs().format('YYYY-MM-DD');
  const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD');
  const now = dayjs();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, due_time, status, is_active, is_fixed, member_id')
    .eq('household_id', HOUSEHOLD_ID)
    .neq('status', 'cancelled')
    .eq('is_active', true)
    .eq('is_fixed', true)
    .in('due_date', [today, tomorrow]);

  const leads = Array.isArray(notif?.lead_minutes) ? notif.lead_minutes : [30];
  debug.now = now.format('YYYY-MM-DD HH:mm');
  debug.today = today;
  debug.candidate_tasks = (tasks ?? [])
    .filter((t) => t.due_date && t.due_time)
    .map((t) => {
      const dueAt = dayjs(`${t.due_date}T${(t.due_time as string).slice(0, 8)}`);
      const diffMin = dueAt.diff(now, 'minute');
      const matchedLead = (leads as number[]).find(
        (m) => Math.abs(diffMin - m) <= 2,
      );
      return {
        title: t.title,
        due_date: t.due_date,
        due_time: t.due_time,
        diff_min: diffMin,
        matches_lead: matchedLead ?? null,
        will_send: matchedLead !== undefined && diffMin >= 0,
      };
    });

  return NextResponse.json({ ok: true, debug });
}
