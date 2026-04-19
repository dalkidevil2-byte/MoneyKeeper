export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);

  const accountId = searchParams.get('account_id');
  const ticker = searchParams.get('ticker');
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') ?? '100');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    let accountIds: string[] | null = null;
    if (!accountId) {
      const { data: owners, error: ownerErr } = await supabase
        .from('paper_owners')
        .select('id')
        .eq('household_id', householdId);
      if (ownerErr) throw ownerErr;
      const ownerIds = (owners ?? []).map((o) => o.id);
      if (ownerIds.length === 0) return NextResponse.json({ transactions: [] });

      const { data: accounts, error: accErr } = await supabase
        .from('paper_accounts')
        .select('id')
        .in('owner_id', ownerIds);
      if (accErr) throw accErr;
      accountIds = (accounts ?? []).map((a) => a.id);
      if (accountIds.length === 0) return NextResponse.json({ transactions: [] });
    }

    let query = supabase
      .from('paper_transactions')
      .select('*, account:paper_accounts!account_id(id, broker_name, owner_id)')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) query = query.eq('account_id', accountId);
    else if (accountIds) query = query.in('account_id', accountIds);

    if (ticker) query = query.eq('ticker', ticker);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (type) query = query.eq('type', type);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ transactions: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '거래 조회 실패';
    console.error('[GET /paper/transactions]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();

    if (!body.account_id) return NextResponse.json({ error: 'account_id 필요' }, { status: 400 });
    if (!body.ticker) return NextResponse.json({ error: 'ticker 필요' }, { status: 400 });
    if (!body.type || !['BUY', 'SELL'].includes(body.type))
      return NextResponse.json({ error: "type은 BUY 또는 SELL" }, { status: 400 });
    if (!body.date) return NextResponse.json({ error: 'date 필요' }, { status: 400 });
    if (!body.quantity || body.quantity <= 0)
      return NextResponse.json({ error: '수량 오류' }, { status: 400 });
    if (body.price === undefined || body.price < 0)
      return NextResponse.json({ error: '가격 오류' }, { status: 400 });

    const { data, error } = await supabase
      .from('paper_transactions')
      .insert({
        account_id: body.account_id,
        ticker: body.ticker,
        company_name: body.company_name ?? '',
        type: body.type,
        date: body.date,
        quantity: body.quantity,
        price: body.price,
        memo: body.memo ?? '',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '거래 저장 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
