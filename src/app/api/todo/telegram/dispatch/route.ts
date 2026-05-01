export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { sendTelegramMessage } from '@/lib/telegram';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// POST/GET /api/todo/telegram/dispatch
// 매분 실행되어 곧 시작될 일정에 대한 알림을 멤버별로 발송.
// 같은 task + occurrence_date + lead_minutes + member 조합은 한 번만 발송.
async function handle(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  try {
    // 알림 켜져 있어야 함
    const { data: notifSettings } = await supabase
      .from('todo_notification_settings')
      .select('lead_minutes, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (notifSettings && notifSettings.enabled === false) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'notif disabled' });
    }
    const leadMinutes: number[] =
      notifSettings?.lead_minutes && Array.isArray(notifSettings.lead_minutes)
        ? notifSettings.lead_minutes
        : [5, 30];

    const { data: tgSettings } = await supabase
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!tgSettings?.bot_token || tgSettings.enabled === false) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'telegram disabled' });
    }
    const botToken = tgSettings.bot_token;

    // 멤버 chat_id 매핑
    const { data: members } = await supabase
      .from('members')
      .select('id, name, telegram_chat_id')
      .eq('household_id', householdId)
      .eq('is_active', true);
    const memberMap = new Map<string, { name: string; chat_id: string }>();
    for (const m of members ?? []) {
      if (m.telegram_chat_id) {
        memberMap.set(m.id as string, {
          name: m.name as string,
          chat_id: m.telegram_chat_id as string,
        });
      }
    }
    if (memberMap.size === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'no chat_ids' });
    }

    // 오늘+내일 시간 일정 — 서버 UTC 가 아닌 KST 기준
    const today = dayjs().tz(TZ).format('YYYY-MM-DD');
    const tomorrow = dayjs().tz(TZ).add(1, 'day').format('YYYY-MM-DD');
    const { data: tasks } = await supabase
      .from('tasks')
      .select(`
        id, title, due_date, due_time, status,
        member_id, target_member_ids, category_main
      `)
      .eq('household_id', householdId)
      .neq('status', 'cancelled')
      .eq('is_active', true)
      .eq('is_fixed', true)
      .in('due_date', [today, tomorrow]);

    const now = dayjs().tz(TZ);
    const candidates: {
      task_id: string;
      task_title: string;
      occurrence_date: string;
      lead: number;
      due_at: dayjs.Dayjs;
      member_ids: string[];
    }[] = [];

    for (const t of tasks ?? []) {
      if (t.status === 'done') continue;
      if (!t.due_date || !t.due_time) continue;
      const dueAt = dayjs.tz(
        `${t.due_date}T${(t.due_time as string).slice(0, 8)}`,
        TZ,
      );
      const diffMin = dueAt.diff(now, 'minute');
      if (diffMin < 0) continue;
      // lead 매칭 — 분 단위로 [-2, +2] 윈도우 안에 들어오면 트리거
      // (cron 이 정확한 분 단위가 아닐 수 있어 약간의 jitter 허용)
      const matchedLead = leadMinutes.find(
        (m) => Math.abs(diffMin - m) <= 2,
      );
      if (matchedLead === undefined) continue;

      // 수신자 결정
      const memberIds = new Set<string>();
      if (Array.isArray(t.target_member_ids) && t.target_member_ids.length > 0) {
        for (const id of t.target_member_ids as string[]) memberIds.add(id);
      } else if (t.member_id) {
        memberIds.add(t.member_id as string);
      } else {
        // 공유 일정 → 모든 등록된 chat_id 멤버
        for (const id of memberMap.keys()) memberIds.add(id);
      }
      candidates.push({
        task_id: t.id as string,
        task_title: t.title as string,
        occurrence_date: t.due_date as string,
        lead: matchedLead,
        due_at: dueAt,
        member_ids: Array.from(memberIds),
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
    }

    // 이미 발송된 (task, occ, lead, member) 조합 조회
    const { data: sentLogs } = await supabase
      .from('telegram_sent_log')
      .select('task_id, occurrence_date, lead_minutes, member_id')
      .eq('household_id', householdId)
      .gte('occurrence_date', today)
      .lte('occurrence_date', tomorrow);
    const sentSet = new Set(
      (sentLogs ?? []).map(
        (l) => `${l.task_id}|${l.occurrence_date}|${l.lead_minutes}|${l.member_id ?? ''}`,
      ),
    );

    let sent = 0;
    const errors: string[] = [];

    for (const c of candidates) {
      const remaining = c.due_at.diff(now, 'minute');
      const remainLabel =
        remaining < 1
          ? '곧 시작'
          : remaining < 60
            ? `${remaining}분 후`
            : `${Math.floor(remaining / 60)}시간 ${remaining % 60}분 후`;
      const dueLabel = c.due_at.format('HH:mm');

      for (const mid of c.member_ids) {
        const m = memberMap.get(mid);
        if (!m?.chat_id) continue;
        const key = `${c.task_id}|${c.occurrence_date}|${c.lead}|${mid}`;
        if (sentSet.has(key)) continue;

        const text = `🔔 <b>${escapeHtml(c.task_title)}</b>\n⏰ ${dueLabel} · ${remainLabel}`;
        try {
          await sendTelegramMessage(botToken, m.chat_id, text);
          await supabase.from('telegram_sent_log').insert({
            household_id: householdId,
            task_id: c.task_id,
            member_id: mid,
            occurrence_date: c.occurrence_date,
            lead_minutes: c.lead,
          });
          sent++;
        } catch (e: any) {
          errors.push(`${m.name}: ${e?.message ?? e}`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      candidates: candidates.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('[telegram/dispatch]', error);
    return NextResponse.json({ error: error?.message ?? '실패' }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export { handle as POST, handle as GET };
