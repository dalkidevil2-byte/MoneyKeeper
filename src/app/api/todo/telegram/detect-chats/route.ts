export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchRecentChats } from '@/lib/telegram';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 봇과 대화한 텔레그램 사용자 목록 조회 (chat_id 자동 감지용)
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  try {
    const { data: settings } = await supabase
      .from('telegram_settings')
      .select('bot_token')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!settings?.bot_token) {
      return NextResponse.json({ error: '봇 토큰이 등록되지 않았습니다.' }, { status: 400 });
    }
    const chats = await fetchRecentChats(settings.bot_token);
    return NextResponse.json({ chats });
  } catch (error: any) {
    console.error('[detect-chats]', error);
    return NextResponse.json(
      { error: error?.message ?? '감지 실패' },
      { status: 500 },
    );
  }
}
