export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import OpenAI from 'openai';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Daily Track 미체크 알림 발송 (cron 매분 호출).
 * - 각 track 의 reminder_time 이 현재 시각 ±2분 안이면 트리거 후보
 * - 오늘 활성 + 오늘 아직 체크 안 된 항목만
 * - 같은 (track, 오늘날짜, member) 는 1회만 발송
 * - LLM 으로 짧은 리마인더 멘트 생성
 */
async function handle(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    // 텔레그램 활성 + 토큰
    const { data: tg } = await supabase
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!tg?.bot_token || tg.enabled === false) {
      return NextResponse.json({ ok: true, sent: 0, reason: 'tg disabled' });
    }

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

    // 모든 활성 daily_tracks
    const { data: tracks } = await supabase
      .from('daily_tracks')
      .select('id, title, emoji, member_id, target_member_ids, weekdays, reminder_time, target_count, period_unit')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .not('reminder_time', 'is', null);

    if (!tracks || tracks.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
    }

    const now = dayjs().tz(TZ);
    const today = now.format('YYYY-MM-DD');
    const nowMin = now.hour() * 60 + now.minute();
    const todayDow = now.day(); // 0=일

    // 매칭 윈도우 ±2분
    const candidates = tracks.filter((t) => {
      if (!t.reminder_time) return false;
      const [h, m] = (t.reminder_time as string).split(':').map(Number);
      const remMin = h * 60 + (m || 0);
      if (Math.abs(nowMin - remMin) > 2) return false;
      // 오늘 요일 활성?
      const wds = (t.weekdays as number[] | null) ?? [];
      if (wds.length > 0 && !wds.includes(todayDow)) return false;
      return true;
    });

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, candidates: 0 });
    }

    // 오늘 이미 체크된 track 제외
    const trackIds = candidates.map((t) => t.id as string);
    const { data: logs } = await supabase
      .from('daily_track_logs')
      .select('track_id')
      .eq('household_id', householdId)
      .in('track_id', trackIds)
      .eq('checked_on', today);
    const doneIds = new Set((logs ?? []).map((l) => l.track_id as string));

    // 이미 발송된 (track, today, member) 조합 제외
    const { data: sentRows } = await supabase
      .from('daily_track_reminder_log')
      .select('track_id, member_id')
      .eq('household_id', householdId)
      .in('track_id', trackIds)
      .eq('reminder_date', today);
    const sentSet = new Set(
      (sentRows ?? []).map((r) => `${r.track_id}|${r.member_id ?? ''}`),
    );

    const pending = candidates.filter((t) => !doneIds.has(t.id as string));

    let sent = 0;
    for (const t of pending) {
      // 수신자: target_member_ids 또는 member_id
      const memberIds = new Set<string>();
      if (Array.isArray(t.target_member_ids) && t.target_member_ids.length > 0) {
        for (const id of t.target_member_ids as string[]) memberIds.add(id);
      } else if (t.member_id) {
        memberIds.add(t.member_id as string);
      } else {
        // 공유 — 모든 등록 멤버
        for (const id of memberMap.keys()) memberIds.add(id);
      }

      // 멘트 생성 (LLM)
      let message = '';
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                '루틴 알림 메시지 1줄 + 따뜻한 한 마디 1줄. 한국어, 친근, 이모지 1~2개. 짧게.',
            },
            {
              role: 'user',
              content: `루틴: "${(t.emoji as string) ?? ''} ${t.title}". 알림시간: ${t.reminder_time}. 오늘 아직 체크 안 됨.`,
            },
          ],
          temperature: 0.8,
          max_tokens: 80,
        });
        message =
          resp.choices[0]?.message?.content?.trim() ??
          `⏰ ${t.reminder_time} — '${t.title}' 아직 체크 안 했어요!`;
      } catch {
        message = `⏰ ${t.reminder_time} — '${t.title}' 아직 체크 안 했어요!`;
      }

      for (const mid of memberIds) {
        const key = `${t.id}|${mid}`;
        if (sentSet.has(key)) continue;
        const m = memberMap.get(mid);
        if (!m?.chat_id) continue;
        try {
          await sendTelegramMessage(tg.bot_token, m.chat_id, message);
          await supabase.from('daily_track_reminder_log').insert({
            household_id: householdId,
            track_id: t.id,
            member_id: mid,
            reminder_date: today,
          });
          sent++;
        } catch (e) {
          console.warn('[dt-reminder] send fail', e);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sent,
      candidates: candidates.length,
      pending: pending.length,
    });
  } catch (e) {
    console.error('[dt-reminder]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as POST, handle as GET };
