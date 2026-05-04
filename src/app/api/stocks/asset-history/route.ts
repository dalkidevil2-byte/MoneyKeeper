export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/asset-history?household_id=&start_date=&end_date=
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  let query = supabase
    .from('stock_asset_history')
    .select('*')
    .eq('household_id', householdId);

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query.order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 시드머니 (누적 입금-출금) 계산용 — 모든 cash_flows
  // household → owners → accounts → cash_flows
  const { data: owners } = await supabase
    .from('stock_owners')
    .select('id')
    .eq('household_id', householdId);
  const ownerIds = (owners ?? []).map((o) => o.id as string);
  let cashFlows: Array<{ date: string; type: string; amount: number }> = [];
  if (ownerIds.length > 0) {
    const { data: accs } = await supabase
      .from('stock_accounts')
      .select('id')
      .in('owner_id', ownerIds);
    const accIds = (accs ?? []).map((a) => a.id as string);
    if (accIds.length > 0) {
      const { data: flows } = await supabase
        .from('stock_cash_flows')
        .select('date, type, amount')
        .in('account_id', accIds)
        .order('date', { ascending: true });
      cashFlows = (flows ?? []) as typeof cashFlows;
    }
  }

  // 각 날짜의 누적 시드머니 (그날까지의 deposit - withdraw)
  const enriched = (data ?? []).map((row) => {
    const dateKey = row.date as string;
    let seed = 0;
    for (const f of cashFlows) {
      if (f.date > dateKey) break;
      seed += f.type === 'DEPOSIT' ? Number(f.amount) : -Number(f.amount);
    }
    const totalValue = Number(row.total_value) || 0;
    return {
      ...row,
      seed_money: seed,
      pnl: totalValue - seed, // 평가금액 - 시드 = 누적 손익
    };
  });

  return NextResponse.json({ history: enriched });
}

// POST /api/stocks/asset-history (upsert by household+date)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.date) {
    return NextResponse.json({ error: 'date가 필요합니다.' }, { status: 400 });
  }
  if (body.total_value === undefined || body.total_value === null) {
    return NextResponse.json({ error: 'total_value가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stock_asset_history')
    .upsert(
      {
        household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
        date: body.date,
        total_value: body.total_value,
      },
      { onConflict: 'household_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
