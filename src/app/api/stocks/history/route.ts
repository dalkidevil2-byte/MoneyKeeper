export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  yfHeaders,
  saveHistoryCache,
  loadHistoryCache,
  naverHistoryFallback,
} from '@/lib/stock-quote';

// GET /api/stocks/history?ticker=005930.KS&period=3mo
// 1차: Yahoo → 2차: 네이버 (KS/KQ) → 3차: 인메모리 캐시
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const period = searchParams.get('period') ?? '3mo';
  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  const cacheKey = `${ticker}_${period}`;

  // 1차: Yahoo
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=${period}`;
    const response = await fetch(url, { headers: yfHeaders() });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const data = await response.json();
    if (data?.chart?.error || !data?.chart?.result) {
      throw new Error('Yahoo 빈 응답');
    }
    const count = data.chart.result[0]?.timestamp?.length ?? 0;
    if (count === 0) throw new Error('Yahoo 데이터 0개');
    saveHistoryCache(cacheKey, data);
    return NextResponse.json(data);
  } catch (err) {
    console.warn(`[history] Yahoo 실패 (${ticker}):`, (err as Error).message);
  }

  // 2차: 네이버
  const naverData = await naverHistoryFallback(ticker, period);
  if (naverData) {
    saveHistoryCache(cacheKey, naverData);
    return NextResponse.json(naverData);
  }

  // 3차: 캐시
  const cached = loadHistoryCache(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  return NextResponse.json(
    { error: `${ticker} 히스토리 데이터를 가져올 수 없습니다.` },
    { status: 503 }
  );
}
