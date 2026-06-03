export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import crypto from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase';
import { runAssistant } from '@/lib/assistant-chat';
import { toSlackMrkdwn } from '@/lib/slack';

/**
 * Slack Events API 수신 엔드포인트 (집사-클코 ↔ MoneyKeeper Q&A).
 *
 * 흐름:
 * 1. 슬랙이 채널 메시지를 이 URL 로 POST.
 * 2. 서명 검증 → url_verification challenge 처리 → 일반 메시지면 큐(slack_pending_questions)에 적재 + ⏳.
 * 3. 응답을 즉시 200 으로 돌려준 뒤(after), FALLBACK_WAIT_MS 대기.
 *    - 그 사이 PC 데몬(집사-클코)이 큐를 claim 해서 처리하면 → 클라우드는 손 뗌(무료).
 *    - 여전히 pending 이면(PC 꺼짐) → 클라우드가 OpenAI 어시스턴트로 답하고 게시.
 *
 * 미들웨어 우회: 이 경로는 cronPaths 화이트리스트에 추가돼 있어야 함 (쿠키 인증 우회).
 * 보안: Slack signing secret 으로 서명 검증하므로 화이트리스트여도 외부 위조 불가.
 */

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const QA_CHANNEL =
  process.env.SLACK_QA_CHANNEL ||
  process.env.SLACK_CHANNEL ||
  process.env.SLACK_BRIEFING_CHANNEL ||
  '';
// 데몬(집사-클코)이 큐를 가져갈 시간을 준 뒤, 그래도 안 가져가면 클라우드가 OpenAI 로 답.
const FALLBACK_WAIT_MS = 15000;

function verifySlackSignature(raw: string, ts: string, sig: string): boolean {
  if (!SIGNING_SECRET || !ts || !sig) return false;
  // 5분 이상 지난 요청은 재전송 공격으로 간주
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${raw}`;
  const mine =
    'v0=' +
    crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(mine), Buffer.from(sig));
  } catch {
    return false;
  }
}

async function slackFetch(method: string, payload: Record<string, unknown>) {
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${BOT_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    console.warn('[slack events] slackFetch', method, (e as Error).message);
    return null;
  }
}

/** FALLBACK_WAIT_MS 후 호출. 아직 pending 이면 OpenAI 로 답. */
async function maybeFallback(questionId: string) {
  const supabase = createServerSupabaseClient();
  // 원자적 claim: 아직 pending 인 것만 가져옴 (데몬이 가져갔으면 0행)
  const { data: claimed } = await supabase
    .from('slack_pending_questions')
    .update({
      status: 'processing',
      engine: 'openai',
      claimed_by: 'cloud',
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId)
    .eq('status', 'pending')
    .select('id, channel, thread_ts, slack_ts, text')
    .maybeSingle();

  if (!claimed) return; // 데몬(집사-클코)이 이미 처리 중 → 클라우드는 손 뗌

  const { channel, thread_ts, slack_ts, text } = claimed as {
    channel: string;
    thread_ts: string | null;
    slack_ts: string;
    text: string;
  };

  let answer = '';
  try {
    const r = await runAssistant(HOUSEHOLD_ID, text, []);
    answer = (r.content || '').trim();
  } catch (e) {
    console.warn('[slack events fallback] runAssistant', (e as Error).message);
  }

  if (!answer) {
    await supabase
      .from('slack_pending_questions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', questionId);
    await slackFetch('reactions.add', {
      channel,
      timestamp: slack_ts,
      name: 'warning',
    });
    return;
  }

  await slackFetch('chat.postMessage', {
    channel,
    text: toSlackMrkdwn(answer),
    mrkdwn: true,
    unfurl_links: false,
    unfurl_media: false,
    ...(thread_ts ? { thread_ts } : {}),
  });
  await supabase
    .from('slack_pending_questions')
    .update({
      status: 'done',
      answer: answer.slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
    .eq('id', questionId);
  // ⏳ → ✅
  await slackFetch('reactions.remove', {
    channel,
    timestamp: slack_ts,
    name: 'hourglass_flowing_sand',
  });
  await slackFetch('reactions.add', {
    channel,
    timestamp: slack_ts,
    name: 'white_check_mark',
  });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const ts = req.headers.get('x-slack-request-timestamp') || '';
  const sig = req.headers.get('x-slack-signature') || '';

  if (!verifySlackSignature(raw, ts, sig)) {
    return new NextResponse('invalid signature', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  // Slack 이벤트 구독 URL 검증
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (body.type === 'event_callback') {
    const ev = (body.event || {}) as Record<string, unknown>;
    const evType = ev.type as string | undefined;
    const subtype = ev.subtype as string | undefined;
    const botId = ev.bot_id as string | undefined;
    const text = ((ev.text as string) || '').trim();
    const channel = (ev.channel as string) || '';
    const slackTs = (ev.ts as string) || '';
    const threadTs = (ev.thread_ts as string) || null;
    const userId = (ev.user as string) || '';

    // 일반 사용자 메시지만 처리 (봇/시스템/수정 메시지 무시)
    const isPlainUserMsg =
      evType === 'message' && !subtype && !botId && !!text && !!slackTs;
    const channelOk = !QA_CHANNEL || channel === QA_CHANNEL;

    if (isPlainUserMsg && channelOk) {
      const supabase = createServerSupabaseClient();
      // 큐 적재 (channel+slack_ts unique → 재전송 중복 무시)
      const { data: inserted } = await supabase
        .from('slack_pending_questions')
        .insert({
          channel,
          thread_ts: threadTs,
          slack_ts: slackTs,
          slack_event_id: (body.event_id as string) || null,
          user_id: userId,
          text,
        })
        .select('id')
        .maybeSingle();

      if (inserted?.id) {
        const qid = inserted.id as string;
        await slackFetch('reactions.add', {
          channel,
          timestamp: slackTs,
          name: 'hourglass_flowing_sand',
        });
        // 응답 후 백그라운드에서 fallback 타이머
        after(async () => {
          await new Promise((r) => setTimeout(r, FALLBACK_WAIT_MS));
          await maybeFallback(qid);
        });
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
