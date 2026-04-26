export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// POST /api/todo/telegram/test  body: { chat_id, member_name? }
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const chatId: string | undefined = body.chat_id;
    const memberName: string | undefined = body.member_name;
    if (!chatId) {
      return NextResponse.json({ error: 'chat_id 필요' }, { status: 400 });
    }
    const { data: settings } = await supabase
      .from('telegram_settings')
      .select('bot_token')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!settings?.bot_token) {
      return NextResponse.json({ error: '봇 토큰이 없습니다.' }, { status: 400 });
    }
    const greet = memberName ? `${memberName}님 안녕하세요! ` : '';
    const text = `🤖 ${greet}My Assistant 알림 테스트입니다.\n앞으로 일정 알림이 여기로 도착할 거예요.`;
    await sendTelegramMessage(settings.bot_token, chatId, text);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[telegram/test]', error);
    return NextResponse.json({ error: error?.message ?? '실패' }, { status: 500 });
  }
}
