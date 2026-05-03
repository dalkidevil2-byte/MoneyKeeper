export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendPushToHousehold, isPushConfigured } from '@/lib/web-push';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 일정/할일 알림 발송 cron.
 * cron-job.org 가 매 5분마다 호출 → 5분 윈도우 안에 들어오는 알림만 발송.
 *
 * 각 task 의 reminders 배열 (분 전 단위) 을 보고
 * due_date + due_time - reminders_min 시각이 ±2.5분 안에 들어오면 푸시.
 * sent_reminders 에 기록해 같은 알림 중복 발송 방지.
 */
async function handle(req: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'VAPID 미설정' },
      { status: 200 },
    );
  }
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const now = dayjs().tz(KST);
  const todayKey = now.format('YYYY-MM-DD');
  // 오늘 + 내일 일정만 조회 (어제 이전은 의미 없음)
  const tomorrowKey = now.add(1, 'day').format('YYYY-MM-DD');

  type Task = {
    id: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
    deadline_date: string | null;
    deadline_time: string | null;
    reminders: Array<{ min: number }>;
    sent_reminders: Array<{ min: number; for_date: string }>;
    kind: string;
  };

  try {
    const { data, error } = await supabase
      .from('tasks')
      .select(
        'id, title, due_date, due_time, deadline_date, deadline_time, reminders, sent_reminders, kind',
      )
      .eq('household_id', householdId)
      .neq('status', 'cancelled')
      .eq('is_active', true)
      .or(`due_date.gte.${todayKey},deadline_date.gte.${todayKey}`);
    if (error) throw error;
    // reminders 가 비어있지 않은 것만 필터 (jsonb is hard with PostgREST)
    const tasks = ((data ?? []) as Task[]).filter(
      (t) => Array.isArray(t.reminders) && t.reminders.length > 0,
    );

    let sent = 0;
    let skipped = 0;
    const fired: Array<{ task_id: string; min: number; title: string }> = [];

    for (const t of tasks) {
      // 기준 날짜/시간 결정
      const refDate = t.due_date ?? t.deadline_date;
      const refTime = t.due_time ?? t.deadline_time;
      if (!refDate) {
        skipped++;
        continue;
      }
      // 시간 없으면 오전 9시로 가정 (예: 오늘 마감인 할일)
      const baseTime = refTime ?? '09:00:00';
      const dueAt = dayjs.tz(`${refDate} ${baseTime}`, KST);

      const reminders = Array.isArray(t.reminders) ? t.reminders : [];
      const sentList = Array.isArray(t.sent_reminders) ? t.sent_reminders : [];

      for (const r of reminders) {
        if (typeof r.min !== 'number') continue;
        const triggerAt = dueAt.subtract(r.min, 'minute');
        // ±2.5분 윈도우
        const diffSec = Math.abs(triggerAt.diff(now, 'second'));
        if (diffSec > 150) continue;

        // 이미 발송했나?
        const alreadySent = sentList.some(
          (s) => s.min === r.min && s.for_date === refDate,
        );
        if (alreadySent) {
          skipped++;
          continue;
        }

        // 발송!
        const minLabel = labelForMinutes(r.min);
        const timeLabel = refTime ? refTime.slice(0, 5) : '';
        const dateLabel = formatDateLabel(refDate, todayKey, tomorrowKey);
        const title = r.min === 0
          ? `🔔 지금 시작 — ${t.title}`
          : `🔔 ${minLabel} — ${t.title}`;
        const body = [dateLabel, timeLabel].filter(Boolean).join(' ');

        const pushRes = await sendPushToHousehold(householdId, {
          title,
          body: body || t.title,
          tag: `task-rem-${t.id}-${r.min}-${refDate}`,
          url: '/todo',
        });
        if (pushRes.sent > 0) {
          sent++;
          fired.push({ task_id: t.id, min: r.min, title: t.title });
          // sent_reminders 업데이트
          const newSent = [...sentList, { min: r.min, for_date: refDate }];
          await supabase
            .from('tasks')
            .update({ sent_reminders: newSent })
            .eq('id', t.id);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      now: now.format(),
      checked: tasks.length,
      sent,
      skipped,
      fired,
    });
  } catch (e) {
    console.error('[tasks/reminders/dispatch]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

function labelForMinutes(min: number): string {
  if (min === 0) return '시작';
  if (min < 60) return `${min}분 전`;
  if (min < 1440) {
    const h = Math.floor(min / 60);
    return `${h}시간 전`;
  }
  const d = Math.floor(min / 1440);
  return `${d}일 전`;
}

function formatDateLabel(refDate: string, todayKey: string, tomorrowKey: string): string {
  if (refDate === todayKey) return '오늘';
  if (refDate === tomorrowKey) return '내일';
  return dayjs(refDate).format('M월 D일');
}

export { handle as GET, handle as POST };
