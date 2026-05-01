export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  computeHoldings,
  computeRealizedTrades,
  type StockTx,
} from '@/lib/stock-holdings';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/memos?household_id=&ticker=&enrich=1
// enrich=1 이면 종목명(KRX) + 소유자별 보유 정보 추가
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const ticker = searchParams.get('ticker');
  const enrich = searchParams.get('enrich') === '1';

  let query = supabase
    .from('stock_memos')
    .select('*')
    .eq('household_id', householdId);

  if (ticker) query = query.eq('ticker', ticker);

  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memos = (data ?? []) as Array<{
    id: string;
    household_id: string;
    ticker: string;
    content: string;
    updated_at: string;
  }>;

  if (!enrich || memos.length === 0) {
    return NextResponse.json({ memos });
  }

  const tickers = Array.from(new Set(memos.map((m) => m.ticker)));

  // 1) 종목명: stock_krx_stocks 매칭
  const { data: krx } = await supabase
    .from('stock_krx_stocks')
    .select('ticker, code, name')
    .in('ticker', tickers);
  const nameByTicker: Record<string, string> = {};
  for (const r of krx ?? []) {
    nameByTicker[r.ticker as string] = r.name as string;
  }

  // 2) 보유 정보 — 세대의 모든 owner / account / 해당 ticker 거래 fetch
  const { data: owners } = await supabase
    .from('stock_owners')
    .select('id, name')
    .eq('household_id', householdId);
  const ownerList = (owners ?? []) as Array<{ id: string; name: string }>;
  const ownerById: Record<string, string> = {};
  for (const o of ownerList) ownerById[o.id] = o.name;

  let txByTicker: Record<string, Array<{ owner_id: string; tx: StockTx }>> = {};
  if (ownerList.length > 0) {
    const { data: accs } = await supabase
      .from('stock_accounts')
      .select('id, owner_id')
      .in(
        'owner_id',
        ownerList.map((o) => o.id),
      );
    const accList = (accs ?? []) as Array<{ id: string; owner_id: string }>;
    const ownerByAccount: Record<string, string> = {};
    for (const a of accList) ownerByAccount[a.id] = a.owner_id;

    if (accList.length > 0) {
      const { data: txs } = await supabase
        .from('stock_transactions')
        .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
        .in('account_id', accList.map((a) => a.id))
        .in('ticker', tickers);

      txByTicker = {};
      for (const t of (txs ?? []) as StockTx[]) {
        const ownerId = ownerByAccount[t.account_id] ?? '';
        if (!txByTicker[t.ticker]) txByTicker[t.ticker] = [];
        txByTicker[t.ticker].push({ owner_id: ownerId, tx: t });
      }
    }
  }

  // 시세는 클라이언트에서 별도 호출 (서버 self-fetch 가 환경에 따라 불안정)

  const enriched = memos.map((m) => {
    const grouped = txByTicker[m.ticker] ?? [];
    // owner 별로 거래 묶어서 holding / realized 계산
    const byOwner: Record<string, StockTx[]> = {};
    for (const { owner_id, tx } of grouped) {
      if (!byOwner[owner_id]) byOwner[owner_id] = [];
      byOwner[owner_id].push(tx);
    }
    const holdings: Array<{
      owner_id: string;
      owner_name: string;
      qty: number;
      avgPrice: number;
      invested: number;
    }> = [];
    const realizedByOwner: Array<{
      owner_id: string;
      owner_name: string;
      total_pl: number;
      total_qty: number;
      trade_count: number;
    }> = [];

    for (const [ownerId, ownerTxs] of Object.entries(byOwner)) {
      const hs = computeHoldings(ownerTxs);
      let qty = 0;
      let invested = 0;
      for (const h of hs) {
        if (h.ticker !== m.ticker) continue;
        qty += h.qty;
        invested += h.qty * h.avgPrice;
      }
      if (qty > 0.00001) {
        holdings.push({
          owner_id: ownerId,
          owner_name: ownerById[ownerId] ?? '?',
          qty,
          avgPrice: invested / qty,
          invested,
        });
      }
      // 실현 손익 (이 종목 한정)
      const realized = computeRealizedTrades(ownerTxs).filter((r) => r.ticker === m.ticker);
      if (realized.length > 0) {
        realizedByOwner.push({
          owner_id: ownerId,
          owner_name: ownerById[ownerId] ?? '?',
          total_pl: realized.reduce((s, r) => s + r.pl, 0),
          total_qty: realized.reduce((s, r) => s + r.quantity, 0),
          trade_count: realized.length,
        });
      }
    }

    // 거래 내역 (UI 표시용 — owner_name 추가)
    const trades = grouped
      .map(({ owner_id, tx }) => ({
        id: tx.id,
        date: tx.date,
        type: tx.type,
        quantity: tx.quantity,
        price: tx.price,
        owner_id,
        owner_name: ownerById[owner_id] ?? '?',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      ...m,
      name: nameByTicker[m.ticker] ?? null,
      holdings,
      realized: realizedByOwner,
      trades,
      has_history: trades.length > 0,
    };
  });

  return NextResponse.json({ memos: enriched });
}

// POST /api/stocks/memos (upsert by household+ticker)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.ticker) {
    return NextResponse.json({ error: 'ticker가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stock_memos')
    .upsert(
      {
        household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
        ticker: body.ticker,
        content: body.content ?? '',
      },
      { onConflict: 'household_id,ticker' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memo: data }, { status: 201 });
}
