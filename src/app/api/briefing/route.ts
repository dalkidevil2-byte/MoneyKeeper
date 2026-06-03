export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing, type BriefingMode } from '@/lib/daily-briefing';
import { sendPushToHousehold, isPushConfigured } from '@/lib/web-push';
import { sendTelegramMessage } from '@/lib/telegram';
import { sendSlackMessage, toSlackMrkdwn } from '@/lib/slack';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET/POST /api/briefing?mode=morning|evening&push=1&slack=1
 * - mode 미지정시 시간대 자동 (06~12: morning, 18~24: evening, 그 외: morning)
 * - push=1 이면 PWA 푸시 + 텔레그램 발송 (기본은 응답으로만 반환)
 * - slack=1 이면 슬랙(봇 집사-클코)으로 발송. push 와 독립적.
 *
 * 외부 cron 에서:
 *   - 매일 07:00 KST: GET /api/briefing?mode=morning&slack=1
 *   - 매일 22:00 KST: GET /api/briefing?mode=evening&slack=1
 */
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const push = searchParams.get('push') === '1';
  const slack = searchParams.get('slack') === '1';
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
    let telegram: { sent: number; failed: number; reason?: string } | null = null;
    if (push) {
      try {
        const supabase = createServerSupabaseClient();
        const { data: tg } = await supabase
          .from('telegram_settings')
          .select('bot_token, chat_id, is_active')
          .eq('household_id', householdId)
          .maybeSingle();

        // bot_token: DB 우선, 없으면 env var fallback
        const botToken =
          (tg?.bot_token as string | undefined) ||
          process.env.TELEGRAM_BOT_TOKEN ||
          '';

        if (!botToken) {
          telegram = { sent: 0, failed: 0, reason: 'no bot_token in DB or env' };
        } else {
          // 발송 대상 chat_id 들 수집 (중복 제거)
          const chatIds = new Set<string>();
          if (tg?.chat_id) chatIds.add(String(tg.chat_id));
          const { data: members } = await supabase
            .from('members')
            .select('telegram_chat_id, name')
            .eq('household_id', householdId)
            .eq('is_active', true);
          for (const m of members ?? []) {
            const cid = m.telegram_chat_id as string | null;
            if (cid && cid.trim()) chatIds.add(cid.trim());
          }

          if (chatIds.size === 0) {
            telegram = {
              sent: 0,
              failed: 0,
              reason: 'no chat_id in telegram_settings or members',
            };
          } else {
            let sent = 0;
            let failed = 0;
            for (const chatId of chatIds) {
              try {
                const text = `<b>${title}</b>\n\n${body}`;
                await sendTelegramMessage(botToken, chatId, text);
                sent++;
              } catch (e) {
                failed++;
                console.warn('[briefing tg]', chatId, (e as Error).message);
              }
            }
            telegram = { sent, failed };
          }
        }
      } catch (e) {
        console.warn('[briefing telegram block]', e);
        telegram = { sent: 0, failed: 0, reason: (e as Error).message };
      }
    }

    // ─── 슬랙 발송 (push 와 독립) ───
    let slackResult: { sent: number; failed: number; reason?: string } | null =
      null;
    if (slack) {
      const slackToken = process.env.SLACK_BOT_TOKEN || '';
      const slackChannel =
        process.env.SLACK_BRIEFING_CHANNEL || process.env.SLACK_CHANNEL || '';
      if (!slackToken || !slackChannel) {
        slackResult = {
          sent: 0,
          failed: 0,
          reason: 'no SLACK_BOT_TOKEN or SLACK_BRIEFING_CHANNEL/SLACK_CHANNEL',
        };
      } else {
        try {
          const text = `*${title}*\n\n${toSlackMrkdwn(body)}`;
          await sendSlackMessage(slackToken, slackChannel, text);
          slackResult = { sent: 1, failed: 0 };
        } catch (e) {
          console.warn('[briefing slack]', (e as Error).message);
          slackResult = { sent: 0, failed: 1, reason: (e as Error).message };
        }
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      title,
      body,
      pushed,
      telegram,
      slack: slackResult,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
