export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import {
  yfHeaders,
  savePriceCache,
  loadPriceCache,
  naverQuoteFallback,
  naverNxtFallback,
  type QuoteResult,
} from '@/lib/stock-quote';
import {
  loadQuoteCache,
  saveQuoteCache,
  shouldFetchExternal,
  type CachedQuote,
} from '@/lib/stock-quote-cache';
import {
  isLiveTradingNow,
  shouldPreferNxtPrice,
  getMarketState,
} from '@/lib/market-hours';

// GET /api/stocks/quote?symbols=AAPL,005930.KS
//
// 시세 조회 우선순위:
// 1) DB 캐시 → 시장 닫힘 + 신선 → 그대로 반환 (외부 호출 X)
// 2) 시장 열림 또는 캐시 stale → Yahoo 1차
// 3) Yahoo 실패 → Naver 폴백
// 4) 한국주식 + NXT 시간대 → Naver NXT 가격 추가 fetch
// 5) 모두 실패 → 메모리 캐시 또는 DB 캐시
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols');
  if (!symbols) return NextResponse.json({ error: 'symbols required' }, { status: 400 });

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean);
  const dbCache = await loadQuoteCache(symbolList);
  const marketState = getMarketState();
  const preferNxt = shouldPreferNxtPrice();

  // 캐시만으로 충족되는지 (시장 닫힘 + 신선)
  const allFromCache =
    !isLiveTradingNow() &&
    symbolList.every((s) => {
      const c = dbCache[s];
      return c && !shouldFetchExternal(c);
    });

  if (allFromCache) {
    const result = symbolList.map((s) => buildResultFromCache(dbCache[s], preferNxt));
    return NextResponse.json({
      quoteResponse: { result, error: null, source: 'db_cache' },
      marketState,
    });
  }

  // 1차: Yahoo
  let yahooResults: QuoteResult[] = [];
  try {
    const url =
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}` +
      `&fields=shortName,regularMarketPrice,regularMarketPreviousClose,regularMarketChange,` +
      `regularMarketChangePercent,currency,marketState,postMarketPrice,postMarketChange,postMarketChangePercent`;
    const response = await fetch(url, { headers: yfHeaders() });
    if (response.ok) {
      const data = await response.json();
      yahooResults = data?.quoteResponse?.result ?? [];
    }
  } catch (err) {
    console.warn('[quote] Yahoo 실패, 네이버 폴백:', (err as Error).message);
  }

  // 2차: 네이버 폴백 (Yahoo 빈 응답인 심볼만)
  const yahooSymbols = new Set(yahooResults.map((r) => r.symbol));
  const naverPromises = symbolList
    .filter((s) => !yahooSymbols.has(s))
    .map((s) => naverQuoteFallback(s));
  const naverResults = (await Promise.all(naverPromises)).filter(
    (r): r is QuoteResult => !!r,
  );

  const baseResults: QuoteResult[] = [...yahooResults, ...naverResults];

  // 3차: NXT 가격 (한국주식 + NXT 시간대)
  const nxtMap: Record<string, { price: number; change?: number; pct?: number }> = {};
  if (isLiveTradingNow() && (marketState !== 'KRX_OPEN' || preferNxt)) {
    const nxtTargets = symbolList.filter((s) => /^\d{6}\.(KS|KQ)$/.test(s));
    const nxtPromises = nxtTargets.map((s) => naverNxtFallback(s));
    const nxtResults = await Promise.all(nxtPromises);
    for (const r of nxtResults) {
      if (r) {
        nxtMap[r.symbol] = {
          price: r.nxtPrice,
          change: r.nxtChange,
          pct: r.nxtChangePct,
        };
      }
    }
  }

  // 캐시 저장 + 응답 조립
  const finalResults: QuoteResult[] = [];
  for (const sym of symbolList) {
    const fresh = baseResults.find((r) => r.symbol === sym);
    const nxt = nxtMap[sym];
    if (fresh) {
      // 인메모리 + DB 둘 다 저장
      savePriceCache(fresh.symbol, fresh);
      void saveQuoteCache({
        ...fresh,
        nxtPrice: nxt?.price,
        nxtChange: nxt?.change,
        nxtChangePct: nxt?.pct,
      });
      // NXT 시간대면 NXT 가격을 메인 가격으로 노출 + regular 는 별도
      const out: QuoteResult = { ...fresh };
      if (preferNxt && nxt?.price) {
        // 응답에는 NXT 가격을 우선 노출, 원래 KRX 가격은 previousClose 처럼 별도
        out.regularMarketPrice = nxt.price;
        out.regularMarketChange = nxt.change ?? out.regularMarketChange;
        out.regularMarketChangePercent = nxt.pct ?? out.regularMarketChangePercent;
        out.source = (out.source ?? 'yahoo') + '+nxt';
      }
      finalResults.push(out);
    } else {
      // 외부 API 모두 실패 → DB 캐시 → 메모리 캐시
      const dbC = dbCache[sym];
      if (dbC) {
        finalResults.push(buildResultFromCache(dbC, preferNxt));
      } else {
        const memC = loadPriceCache(sym);
        if (memC) finalResults.push({ ...memC, source: 'mem_cache' });
      }
    }
  }

  return NextResponse.json({
    quoteResponse: { result: finalResults, error: null },
    marketState,
  });
}

function buildResultFromCache(c: CachedQuote, preferNxt: boolean): QuoteResult {
  const useNxt = preferNxt && typeof c.nxt_price === 'number' && c.nxt_price > 0;
  return {
    symbol: c.symbol,
    shortName: c.short_name ?? undefined,
    regularMarketPrice:
      useNxt && c.nxt_price != null
        ? c.nxt_price
        : (c.price ?? c.last_close_price ?? undefined) || undefined,
    regularMarketPreviousClose: c.previous_close ?? undefined,
    regularMarketChange:
      useNxt && c.nxt_change_amount != null
        ? c.nxt_change_amount
        : c.change_amount ?? undefined,
    regularMarketChangePercent:
      useNxt && c.nxt_change_percent != null
        ? c.nxt_change_percent
        : c.change_percent ?? undefined,
    currency: c.currency ?? undefined,
    marketState: c.market_state ?? undefined,
    source: useNxt ? 'db_cache+nxt' : 'db_cache',
  };
}
