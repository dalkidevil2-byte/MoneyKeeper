export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * AI 어시스턴트의 주식 도구가 보는 데이터 진단.
 */
export async function GET() {
  const supabase = createServerSupabaseClient();
  const debug: Record<string, unknown> = {};

  // owners
  const { data: owners } = await supabase
    .from('stock_owners')
    .select('id, name')
    .eq('household_id', HOUSEHOLD_ID);
  debug.owners = owners?.map((o) => ({ id: o.id, name: o.name })) ?? [];

  if (!owners || owners.length === 0) {
    return NextResponse.json({ ok: true, debug, hint: 'no owners' });
  }

  const ownerIds = owners.map((o) => o.id as string);

  // accounts
  const { data: accounts } = await supabase
    .from('stock_accounts')
    .select('id, owner_id, broker_name')
    .in('owner_id', ownerIds);
  debug.accounts = accounts?.length ?? 0;
  debug.accounts_list = accounts?.map((a) => ({
    id: a.id,
    broker: a.broker_name,
  }));

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ ok: true, debug, hint: 'no accounts' });
  }

  const accIds = accounts.map((a) => a.id as string);

  // transactions count
  const { count: txCount } = await supabase
    .from('stock_transactions')
    .select('id', { count: 'exact', head: true })
    .in('account_id', accIds);
  debug.tx_count = txCount;

  const { data: txs } = await supabase
    .from('stock_transactions')
    .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
    .in('account_id', accIds)
    .limit(10000);
  debug.tx_fetched = txs?.length ?? 0;

  // unique ticker
  const tickers = new Set((txs ?? []).map((t) => t.ticker as string));
  debug.unique_tickers = tickers.size;

  // 보유 종목 (computeHoldings + aggregateByTicker)
  if (txs && txs.length > 0) {
    const { computeHoldings, aggregateByTicker } = await import('@/lib/stock-holdings');
    const holdings = computeHoldings(txs as never);
    const agg = aggregateByTicker(holdings);
    debug.holdings_count = agg.length;
    debug.holdings_sample = agg.slice(0, 10).map((a) => ({
      ticker: a.ticker,
      companyName: a.companyName,
      qty: a.qty,
    }));
  }

  return NextResponse.json({ ok: true, debug });
}
