export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/push/subscribe
 * body: { subscription: { endpoint, keys: { p256dh, auth } }, household_id?, ua? }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const sub = body.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: '구독 정보 부족' }, { status: 400 });
    }
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const ua = body.ua ?? req.headers.get('user-agent') ?? '';

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          household_id: householdId,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          ua,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' },
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/push/subscribe?endpoint=...
 * 디바이스 구독 해제 (서버 row 비활성)
 */
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (!endpoint) {
    return NextResponse.json({ error: 'endpoint 필요' }, { status: 400 });
  }
  await supabase
    .from('push_subscriptions')
    .update({ is_active: false })
    .eq('endpoint', endpoint);
  return NextResponse.json({ ok: true });
}
