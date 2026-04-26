export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getMe } from '@/lib/telegram';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

function maskToken(t: string): string {
  if (!t) return '';
  return t.slice(0, 8) + '••••' + t.slice(-4);
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  try {
    const { data } = await supabase
      .from('telegram_settings')
      .select('*')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({
        settings: { household_id: householdId, bot_token: '', bot_username: '', enabled: false },
      });
    }
    return NextResponse.json({
      settings: {
        ...data,
        bot_token_masked: maskToken(data.bot_token ?? ''),
        bot_token: data.bot_token ? '••••••' : '',
      },
    });
  } catch (error: any) {
    console.error('[GET telegram/settings]', error);
    return NextResponse.json({ error: '설정을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const update: Record<string, unknown> = {
      household_id: householdId,
      updated_at: new Date().toISOString(),
    };
    let username = '';
    if (body.bot_token !== undefined && body.bot_token !== '') {
      // 새 토큰 — 검증 + getMe 로 username 조회
      try {
        const me = await getMe(body.bot_token);
        username = me.username ?? '';
        update.bot_token = body.bot_token;
        update.bot_username = username;
      } catch (e: any) {
        return NextResponse.json(
          { error: '잘못된 봇 토큰: ' + (e?.message ?? '') },
          { status: 400 },
        );
      }
    }
    if (typeof body.enabled === 'boolean') update.enabled = body.enabled;

    const { data, error } = await supabase
      .from('telegram_settings')
      .upsert(update, { onConflict: 'household_id' })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({
      settings: {
        ...data,
        bot_token_masked: maskToken(data.bot_token ?? ''),
        bot_token: data.bot_token ? '••••••' : '',
      },
    });
  } catch (error: any) {
    console.error('[PATCH telegram/settings]', error);
    return NextResponse.json({ error: error?.message ?? '저장 실패' }, { status: 500 });
  }
}
