export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/google-calendar';
import { createServerSupabaseClient } from '@/lib/supabase';

// GET /api/google-calendar/callback?code=...&state=household_id
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`/todo/settings?gcal_error=${encodeURIComponent(errorParam)}`, req.url),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/todo/settings?gcal_error=missing_code', req.url));
  }

  const householdId = state;
  try {
    const tokens = await exchangeCodeForTokens(code);
    // id_token 에서 이메일 디코드 (검증 생략 — Google 응답이라 신뢰)
    let email: string | null = null;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf8'),
        );
        email = payload?.email ?? null;
      } catch {
        /* ignore */
      }
    }

    const supabase = createServerSupabaseClient();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from('google_calendar_sync').upsert(
      {
        household_id: householdId,
        google_email: email,
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAt,
        calendar_id: 'primary',
        is_active: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id' },
    );

    return NextResponse.redirect(new URL('/todo/settings?gcal=connected', req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return NextResponse.redirect(
      new URL(`/todo/settings?gcal_error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
