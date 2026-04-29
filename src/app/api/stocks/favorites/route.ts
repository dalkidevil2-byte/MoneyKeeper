export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/favorites → { tickers: string[] }
export async function GET() {
  const supabase = createServerSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('stock_favorites')
      .select('ticker')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID);
    if (error) throw error;
    return NextResponse.json({ tickers: (data ?? []).map((r) => r.ticker as string) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/stocks/favorites { ticker } → 추가 (이미 있으면 idempotent)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const { ticker } = await req.json();
    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json({ error: 'ticker 필요' }, { status: 400 });
    }
    const { error } = await supabase
      .from('stock_favorites')
      .upsert(
        { household_id: DEFAULT_HOUSEHOLD_ID, ticker },
        { onConflict: 'household_id,ticker' },
      );
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/stocks/favorites?ticker=... → 제거
export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const ticker = new URL(req.url).searchParams.get('ticker');
  if (!ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 });
  try {
    const { error } = await supabase
      .from('stock_favorites')
      .delete()
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .eq('ticker', ticker);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
