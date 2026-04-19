export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  yfHeaders,
  saveHistoryCache,
  loadHistoryCache,
  parseOhlcFromChart,
  naverHistoryFallback,
  type OhlcPoint,
} from '@/lib/stock-quote';

// GET /api/stocks/ohlc?ticker=005930.KS&period=3mo
// 1차: Yahoo → 2차: Naver (KS/KQ, OHLC 포함) → 3차: 인메모리 캐시
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const period = searchParams.get('period') ?? '3mo';
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const fetchRange = period === '1mo' ? '3mo' : period;
  const cacheKey = `ohlc_${ticker}_${period}`;

  // 1차: Yahoo
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${fetchRange}`;
    const response = await fetch(url, { headers: yfHeaders() });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const data = await response.json();
    const result = parseOhlcFromChart(data, period);
    if (!result) throw new Error('Yahoo 빈 응답');
    saveHistoryCache(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    console.warn('[ohlc] Yahoo 실패:', (err as Error).message);
  }

  // 2차: Naver (한국 주식 KS/KQ — OHLC 필드 포함)
  const naverData = await naverHistoryFallback(ticker, fetchRange);
  if (naverData) {
    const result = parseOhlcFromChart(naverData, period);
    if (result) {
      saveHistoryCache(cacheKey, result);
      return NextResponse.json(result);
    }
  }

  // 3차: 캐시
  const cached = loadHistoryCache(cacheKey) as OhlcPoint[] | null;
  if (cached) return NextResponse.json(cached);

  return NextResponse.json([]);
}
