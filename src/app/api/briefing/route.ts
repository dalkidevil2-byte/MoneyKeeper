export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing, type BriefingMode } from '@/lib/daily-briefing';
import { sendPushToHousehold, isPushConfigured } from '@/lib/web-push';
import { sendTelegramMessage } from '@/lib/telegram';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET/POST /api/briefing?mode=morning|evening&push=1
 * - mode 미지정시 시간대 자동 (06~12: morning, 18~24: evening, 그 외: morning)
 * - push=1 이면 PWA 푸시도 발송 (기본은 응답으로만 반환)
 *
 * 외부 cron 에서:
 *   - 매일 07:00 KST: GET /api/briefing?mode=morning&push=1
 *   - 매일 22:00 KST: GET /api/briefing?mode=evening&push=1
 */
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const push = searchParams.get('push') === '1';
  const modeParam = searchParams.get('mode');
  let mode: BriefingMode;
  if (modeParam === 'morning' || modeParam === 'evening') {
    mode = modeParam;
  } else {
    const hour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours(); // KST hour
    mode = hour >= 17 ? 'evening' : 'morning';
  }

  try {
    const { title, body } = await generateBriefing(householdId, mode);
    let pushed: { sent: number; failed: number } | null = null;
    if (push && isPushConfigured()) {
      const r = await sendPushToHousehold(householdId, {
        title,
        body,
        tag: `briefing-${mode}-${new Date().toISOString().slice(0, 10)}`,
        url: '/',
      });
      pushed = { sent: r.sent, failed: r.failed };
    }

    // ─── 텔레그램 발송 ───
    let telegram: { sent: number; failed: number } | null = null;
    if (push) {
      try {
        const supabase = createServerSupabaseClient();
        const { data: tg } = await supabase
          .from('telegram_settings')
          .select('bot_token, enabled')
          .eq('household_id', householdId)
          .maybeSingle();
        if (tg?.bot_token && tg.enabled !== false) {
          // chat_id 있는 활성 멤버들한테 발송
          const { data: members } = await supabase
            .from('members')
            .select('telegram_chat_id, name')
            .eq('household_id', householdId)
            .eq('is_active', true)
            .not('telegram_chat_id', 'is', null);
          let sent = 0;
          let failed = 0;
          for (const m of members ?? []) {
            const chatId = m.telegram_chat_id as string;
            if (!chatId) continue;
            try {
              const text = `<b>${title}</b>\n\n${body}`;
              await sendTelegramMessage(tg.bot_token, chatId, text);
              sent++;
            } catch (e) {
              failed++;
              console.warn('[briefing tg]', m.name, (e as Error).message);
            }
          }
          telegram = { sent, failed };
        }
      } catch (e) {
        console.warn('[briefing telegram block]', e);
      }
    }

    return NextResponse.json({ ok: true, mode, title, body, pushed, telegram });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
