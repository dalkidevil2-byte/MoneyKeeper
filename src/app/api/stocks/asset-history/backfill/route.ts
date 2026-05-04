export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { yfHeaders, naverHistoryFallback } from '@/lib/stock-quote';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/stocks/asset-history/backfill?days=30
 *
 * 과거 N일치 자산 추세를 한 번에 채움.
 * - 각 날짜의 보유 수량 = (해당 날짜까지의 거래 누적)
 * - 각 종목의 그날 종가 = Yahoo OHLC (실패 시 Naver 폴백)
 * - 영업일 (KRX는 평일)만 기록
 */
async function handle(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 365);

  try {
    // 보유 가능한 모든 거래 (날짜 정렬)
    const { data: owners } = await supabase
      .from('stock_owners')
      .select('id')
      .eq('household_id', householdId);
    const ownerIds = (owners ?? []).map((o) => o.id as string);
    if (ownerIds.length === 0) {
      return NextResponse.json({ ok: true, days_filled: 0 });
    }
    const { data: accs } = await supabase
      .from('stock_accounts')
      .select('id')
      .in('owner_id', ownerIds);
    const accIds = (accs ?? []).map((a) => a.id as string);
    if (accIds.length === 0) {
      return NextResponse.json({ ok: true, days_filled: 0 });
    }
    const { data: txs } = await supabase
      .from('stock_transactions')
      .select('ticker, type, date, quantity, price')
      .in('account_id', accIds)
      .order('date', { ascending: true });

    if (!txs || txs.length === 0) {
      return NextResponse.json({ ok: true, days_filled: 0, message: 'no trades' });
    }

    // 거래에 등장한 모든 ticker
    const tickers = Array.from(new Set(txs.map((t) => t.ticker as string)));

    // 각 ticker 의 일별 종가 맵 (date → close)
    const priceByTicker: Record<string, Record<string, number>> = {};
    const period = days <= 35 ? '1mo' : days <= 95 ? '3mo' : days <= 190 ? '6mo' : '1y';

    // 종목별 시세 fetch 병렬화 (Promise.all) — sequential 이면 timeout 위험
    const fetchOne = async (ticker: string): Promise<[string, Record<string, number>]> => {
      const closes: Record<string, number> = {};
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${period}&interval=1d`;
        const r = await fetch(url, { headers: yfHeaders() });
        if (r.ok) {
          const j = await r.json();
          const result = j?.chart?.result?.[0];
          const ts: number[] = result?.timestamp ?? [];
          const closeArr: number[] = result?.indicators?.quote?.[0]?.close ?? [];
          for (let i = 0; i < ts.length; i++) {
            const d = new Date(ts[i] * 1000);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
            const c = closeArr[i];
            if (c && Number.isFinite(c)) closes[key] = c;
          }
        }
      } catch {
        /* skip */
      }
      // Naver fallback
      if (Object.keys(closes).length === 0 && /^\d{6}\.(KS|KQ)$/.test(ticker)) {
        const naver = await naverHistoryFallback(ticker, period);
        const ts = naver?.chart?.result?.[0]?.timestamp ?? [];
        const closeArr = naver?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        for (let i = 0; i < ts.length; i++) {
          const d = new Date(ts[i] * 1000);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          const c = closeArr[i];
          if (c && Number.isFinite(c)) closes[key] = c;
        }
      }
      return [ticker, closes];
    };

    const fetchResults = await Promise.all(tickers.map(fetchOne));
    for (const [ticker, closes] of fetchResults) {
      priceByTicker[ticker] = closes;
    }

    // 일별 보유 수량 시뮬레이션 + 평가금액 계산
    const today = dayjs().tz(KST);
    const start = today.subtract(days - 1, 'day');
    const records: Array<{ date: string; total_value: number }> = [];

    let dCursor = start;
    // 거래 누적 — txs 는 이미 날짜 순
    while (dCursor.isBefore(today) || dCursor.isSame(today, 'day')) {
      const dKey = dCursor.format('YYYY-MM-DD');
      const dow = dCursor.day();
      // 평일만 (주말 skip — Naver/Yahoo 도 평일 데이터만)
      if (dow !== 0 && dow !== 6) {
        // 그날까지의 보유 수량 계산
        const heldByTicker: Record<string, number> = {};
        for (const tx of txs) {
          const tDate = tx.date as string;
          if (tDate > dKey) break;
          const ticker = tx.ticker as string;
          const qty = Number(tx.quantity);
          if (tx.type === 'BUY') {
            heldByTicker[ticker] = (heldByTicker[ticker] ?? 0) + qty;
          } else {
            heldByTicker[ticker] = (heldByTicker[ticker] ?? 0) - qty;
          }
        }
        // 그날 평가금액
        let totalValue = 0;
        let priceCount = 0;
        // 그날 종가 없으면 직전 영업일 종가로 fallback
        for (const [ticker, qty] of Object.entries(heldByTicker)) {
          if (qty <= 0) continue;
          let price = priceByTicker[ticker]?.[dKey];
          if (!price) {
            // 가장 가까운 이전 날짜
            const dates = Object.keys(priceByTicker[ticker] ?? {}).sort();
            const prev = [...dates].reverse().find((d) => d <= dKey);
            if (prev) price = priceByTicker[ticker][prev];
          }
          if (price && Number.isFinite(price)) {
            totalValue += qty * price;
            priceCount++;
          }
        }
        if (priceCount > 0) {
          records.push({ date: dKey, total_value: Math.round(totalValue) });
        }
      }
      dCursor = dCursor.add(1, 'day');
    }

    if (records.length === 0) {
      return NextResponse.json({ ok: true, days_filled: 0, message: 'no price data' });
    }

    // upsert
    const upserts = records.map((r) => ({
      household_id: householdId,
      date: r.date,
      total_value: r.total_value,
    }));
    const { error } = await supabase
      .from('stock_asset_history')
      .upsert(upserts, { onConflict: 'household_id,date' });
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      days_filled: records.length,
      first_date: records[0].date,
      last_date: records[records.length - 1].date,
    });
  } catch (e) {
    console.error('[asset-history/backfill]', e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
