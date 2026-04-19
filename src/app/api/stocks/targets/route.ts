export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/targets?household_id=&ticker=
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const ticker = searchParams.get('ticker');

  let query = supabase
    .from('stock_targets')
    .select('*')
    .eq('household_id', householdId);

  if (ticker) query = query.eq('ticker', ticker);

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ targets: data });
}

// POST /api/stocks/targets  (upsert by household+ticker)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.ticker) {
    return NextResponse.json({ error: 'ticker가 필요합니다.' }, { status: 400 });
  }
  if (body.target_pct === undefined || body.target_pct === null) {
    return NextResponse.json({ error: 'target_pct가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stock_targets')
    .upsert(
      {
        household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
        ticker: body.ticker,
        target_pct: body.target_pct,
      },
      { onConflict: 'household_id,ticker' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ target: data }, { status: 201 });
}
