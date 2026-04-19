export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  yfHeaders,
  savePriceCache,
  loadPriceCache,
  naverQuoteFallback,
  type QuoteResult,
} from '@/lib/stock-quote';

// GET /api/stocks/quote?symbols=AAPL,005930.KS
// 1차: Yahoo Finance  → 2차: Naver (KS/KQ) → 3차: 인메모리 캐시
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols');
  if (!symbols) return NextResponse.json({ error: 'symbols required' }, { status: 400 });

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean);

  // 1차: Yahoo
  try {
    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}` +
      `&fields=shortName,regularMarketPrice,regularMarketPreviousClose,regularMarketChange,` +
      `regularMarketChangePercent,currency,marketState,postMarketPrice,postMarketChange,postMarketChangePercent`;
    const response = await fetch(url, { headers: yfHeaders() });
    if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);
    const data = await response.json();
    const results: QuoteResult[] = data?.quoteResponse?.result ?? [];
    if (results.length > 0) {
      results.forEach((r) => savePriceCache(r.symbol, r));
      return NextResponse.json(data);
    }
    throw new Error('Yahoo 빈 응답');
  } catch (err) {
    console.warn('[quote] Yahoo 실패, 네이버 폴백 시도:', (err as Error).message);
  }

  // 2차: 네이버 → 3차: 캐시
  const fallbackResults: QuoteResult[] = [];
  for (const sym of symbolList) {
    const naver = await naverQuoteFallback(sym);
    if (naver) {
      savePriceCache(sym, naver);
      fallbackResults.push(naver);
    } else {
      const cached = loadPriceCache(sym);
      if (cached) {
        fallbackResults.push({ ...cached, source: 'cache' });
      }
    }
  }
  return NextResponse.json({ quoteResponse: { result: fallbackResults, error: null } });
}
