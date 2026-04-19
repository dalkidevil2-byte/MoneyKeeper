export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    let accountIds: string[] | null = null;
    if (!accountId) {
      const { data: owners, error: ownerErr } = await supabase
        .from('paper_owners')
        .select('id')
        .eq('household_id', householdId);
      if (ownerErr) throw ownerErr;
      const ownerIds = (owners ?? []).map((o) => o.id);
      if (ownerIds.length === 0) return NextResponse.json({ flows: [] });

      const { data: accounts, error: accErr } = await supabase
        .from('paper_accounts')
        .select('id')
        .in('owner_id', ownerIds);
      if (accErr) throw accErr;
      accountIds = (accounts ?? []).map((a) => a.id);
      if (accountIds.length === 0) return NextResponse.json({ flows: [] });
    }

    let query = supabase
      .from('paper_cash_flows')
      .select('*')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (accountId) query = query.eq('account_id', accountId);
    else if (accountIds) query = query.in('account_id', accountIds);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ flows: data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '입출금 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();

    if (!body.account_id) return NextResponse.json({ error: 'account_id 필요' }, { status: 400 });
    if (!body.date) return NextResponse.json({ error: 'date 필요' }, { status: 400 });
    if (!body.type || !['DEPOSIT', 'WITHDRAW'].includes(body.type))
      return NextResponse.json({ error: "type은 DEPOSIT 또는 WITHDRAW" }, { status: 400 });
    if (!body.amount || body.amount <= 0)
      return NextResponse.json({ error: '금액은 0보다 커야 합니다' }, { status: 400 });

    const { data, error } = await supabase
      .from('paper_cash_flows')
      .insert({
        account_id: body.account_id,
        date: body.date,
        type: body.type,
        amount: body.amount,
        memo: body.memo ?? '',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ flow: data }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '입출금 저장 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
