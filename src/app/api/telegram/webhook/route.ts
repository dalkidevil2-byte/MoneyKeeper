export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import { runAssistant, type ChatHistoryItem } from '@/lib/assistant-chat';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const HISTORY_TURNS = 10; // 최근 10턴 (= user + assistant 페어 5쌍)

/**
 * 텔레그램 봇 webhook.
 * 텔레그램 → POST /api/telegram/webhook?secret=CRON_SECRET
 * body: Telegram Update 객체
 *
 * 메시지 처리 흐름:
 * 1) chat_id 추출 → households / members 매칭으로 household 식별
 * 2) telegram_chat_history 에서 최근 history 로드
 * 3) runAssistant() 호출
 * 4) sendTelegramMessage 로 답변 전송
 * 5) history 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body?.message ?? body?.edited_message;
    if (!message?.text || !message?.chat?.id) {
      return NextResponse.json({ ok: true, ignored: 'no text' });
    }
    const chatId = String(message.chat.id);
    const userText: string = message.text;

    // /start 명령어
    if (userText.startsWith('/start')) {
      const { data: tg } = await createServerSupabaseClient()
        .from('telegram_settings')
        .select('bot_token')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .maybeSingle();
      if (tg?.bot_token) {
        await sendTelegramMessage(
          tg.bot_token,
          chatId,
          `안녕하세요! 일정·할일·시간 어시스턴트예요. 🤖\n\n예시:\n• 오늘 일정 알려줘\n• 내일 9시에 회의 추가해줘\n• 이번 주 어디에 시간 많이 썼어?\n\n자연스럽게 물어보세요.`,
        );
      }
      return NextResponse.json({ ok: true, action: 'start' });
    }

    const supabase = createServerSupabaseClient();

    // chat_id 로 household + member 식별
    const { data: member } = await supabase
      .from('members')
      .select('household_id, name')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .maybeSingle();

    const householdId = (member?.household_id as string) ?? DEFAULT_HOUSEHOLD_ID;

    // 토큰 + 활성 여부
    const { data: tg } = await supabase
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!tg?.bot_token || tg.enabled === false) {
      return NextResponse.json({ ok: true, ignored: 'tg disabled' });
    }

    // 등록 안 된 chat_id 면 안내
    if (!member) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        `등록되지 않은 사용자에요.\n앱 → 할일 → 설정 → 텔레그램 설정 에서 chat_id (${chatId}) 를 멤버에 등록해주세요.`,
      );
      return NextResponse.json({ ok: true, ignored: 'unknown chat_id' });
    }

    // 최근 history 로드
    const { data: histRows } = await supabase
      .from('telegram_chat_history')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS);
    const history: ChatHistoryItem[] = ((histRows ?? []) as ChatHistoryItem[])
      .reverse(); // 오래된 것 먼저

    // AI 호출
    let reply: string;
    try {
      const { content } = await runAssistant(householdId, userText, history);
      reply = content || '답변을 생성하지 못했어요.';
    } catch (e) {
      console.error('[tg webhook] runAssistant', e);
      reply = '죄송해요, 처리 중 문제가 발생했어요.';
    }

    // 텔레그램 전송
    await sendTelegramMessage(tg.bot_token, chatId, reply);

    // history 저장 (user + assistant)
    await supabase.from('telegram_chat_history').insert([
      { household_id: householdId, chat_id: chatId, role: 'user', content: userText },
      { household_id: householdId, chat_id: chatId, role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[tg webhook]', e);
    // 텔레그램은 200 외 응답이면 재전송하므로 항상 200 으로
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

// GET: webhook 등록 helper — /api/telegram/webhook?secret=...&action=set/delete
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  if (!action) {
    return NextResponse.json({
      hint: 'GET /api/telegram/webhook?action=set | info | delete',
    });
  }

  const supabase = createServerSupabaseClient();
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle();
  if (!tg?.bot_token) {
    return NextResponse.json({ error: 'no bot_token' }, { status: 400 });
  }

  const tgUrl = (path: string) =>
    `https://api.telegram.org/bot${tg.bot_token}/${path}`;

  if (action === 'set') {
    const callback = `${new URL(req.url).origin}/api/telegram/webhook?secret=${process.env.CRON_SECRET ?? ''}`;
    const r = await fetch(tgUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: callback,
        allowed_updates: ['message', 'edited_message'],
      }),
    });
    return NextResponse.json({ action: 'set', telegram: await r.json(), callback });
  }
  if (action === 'info') {
    const r = await fetch(tgUrl('getWebhookInfo'));
    return NextResponse.json(await r.json());
  }
  if (action === 'delete') {
    const r = await fetch(tgUrl('deleteWebhook'), { method: 'POST' });
    return NextResponse.json(await r.json());
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
