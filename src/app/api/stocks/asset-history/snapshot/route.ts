export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { computeHoldings, aggregateByTicker } from '@/lib/stock-holdings';
import { loadQuoteCache } from '@/lib/stock-quote-cache';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/stocks/asset-history/snapshot
 *
 * 오늘(KST) 의 보유종목 평가금액을 계산해서 stock_asset_history 에 upsert.
 * cron 으로 매일 16:00 KST (정규장 종료 후) 실행.
 *
 * 평가금액 계산:
 * - 현재 보유 수량 × stock_quote_cache.last_close_price (또는 price)
 * - 시세 없는 종목은 평단가로 fallback
 */
async function handle(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const date =
    searchParams.get('date') ?? dayjs().tz(KST).format('YYYY-MM-DD');

  try {
    // household → owners → accounts → transactions
    const { data: owners } = await supabase
      .from('stock_owners')
      .select('id')
      .eq('household_id', householdId);
    const ownerIds = (owners ?? []).map((o) => o.id as string);
    if (ownerIds.length === 0) {
      return NextResponse.json({
        ok: true,
        date,
        total_value: 0,
        message: 'no owners',
      });
    }
    const { data: accs } = await supabase
      .from('stock_accounts')
      .select('id')
      .in('owner_id', ownerIds);
    const accIds = (accs ?? []).map((a) => a.id as string);
    if (accIds.length === 0) {
      return NextResponse.json({ ok: true, date, total_value: 0 });
    }
    const { data: txs } = await supabase
      .from('stock_transactions')
      .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
      .in('account_id', accIds)
      .order('date', { ascending: true });

    const holdings = computeHoldings((txs ?? []) as never);
    const agg = aggregateByTicker(holdings);

    // 시세 — DB 캐시에서 last_close_price 우선
    const tickers = Array.from(new Set(agg.map((a) => a.ticker)));
    const cache = await loadQuoteCache(tickers);

    let totalValue = 0;
    let totalInvested = 0;
    const breakdown: Array<{ ticker: string; qty: number; price: number; value: number }> = [];
    for (const a of agg) {
      const c = cache[a.ticker];
      const price =
        (c?.last_close_price as number | undefined) ??
        (c?.price as number | undefined) ??
        a.avgPrice;
      const value = a.qty * price;
      totalValue += value;
      totalInvested += a.invested;
      breakdown.push({ ticker: a.ticker, qty: a.qty, price, value });
    }

    const { error } = await supabase
      .from('stock_asset_history')
      .upsert(
        {
          household_id: householdId,
          date,
          total_value: Math.round(totalValue),
        },
        { onConflict: 'household_id,date' },
      );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      date,
      total_value: Math.round(totalValue),
      total_invested: Math.round(totalInvested),
      unrealized_pl: Math.round(totalValue - totalInvested),
      breakdown,
    });
  } catch (e) {
    console.error('[asset-history/snapshot]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
