/**
 * 주식 시세 영구 캐시 — Supabase `stock_quote_cache` 테이블 사용.
 * 시장 시간 외에는 캐시만 반환해서 외부 API 호출을 줄이고,
 * AI 도구의 평가 금액 계산도 평단가 fallback 대신 종가 fallback 으로 처리.
 */
import { createServerSupabaseClient } from './supabase';
import type { QuoteResult } from './stock-quote';
import {
  getMarketState,
  isLiveTradingNow,
  quoteCacheTtlMs,
} from './market-hours';
import dayjs from 'dayjs';

export type CachedQuote = {
  symbol: string;
  price: number;
  previous_close?: number | null;
  change_amount?: number | null;
  change_percent?: number | null;
  short_name?: string | null;
  currency?: string | null;
  market_state?: string | null;
  source?: string | null;
  nxt_price?: number | null;
  nxt_change_amount?: number | null;
  nxt_change_percent?: number | null;
  fetched_at: string;
  last_close_price?: number | null;
  last_close_date?: string | null;
};

/** 여러 심볼의 캐시 일괄 조회 */
export async function loadQuoteCache(
  symbols: string[],
): Promise<Record<string, CachedQuote>> {
  if (symbols.length === 0) return {};
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('stock_quote_cache')
    .select('*')
    .in('symbol', symbols);
  const map: Record<string, CachedQuote> = {};
  for (const row of data ?? []) {
    map[row.symbol as string] = row as CachedQuote;
  }
  return map;
}

/** 캐시가 신선한가? (시장 상태별 TTL 기준) */
export function isCacheFresh(cached: CachedQuote): boolean {
  const ttl = quoteCacheTtlMs();
  const age = Date.now() - new Date(cached.fetched_at).getTime();
  return age < ttl;
}

/** 시세 1건 upsert. NXT 가격은 별도 저장 (regular 가격은 그대로 유지) */
export async function saveQuoteCache(
  result: QuoteResult & {
    nxtPrice?: number | null;
    nxtChange?: number | null;
    nxtChangePct?: number | null;
  },
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient();
    const today = dayjs().format('YYYY-MM-DD');
    const isClosed = getMarketState() === 'CLOSED';

    // 정규장 종가 갱신 — 정규장 종료 후 첫 fetch 일 때만 last_close_* 업데이트
    // (장 닫힌 시간엔 어차피 가격이 안 변하니 중복 갱신 OK)
    const upsertPayload: Record<string, unknown> = {
      symbol: result.symbol,
      price: result.regularMarketPrice ?? null,
      previous_close: result.regularMarketPreviousClose ?? null,
      change_amount: result.regularMarketChange ?? null,
      change_percent: result.regularMarketChangePercent ?? null,
      short_name: result.shortName ?? null,
      currency: result.currency ?? null,
      market_state: result.marketState ?? null,
      source: result.source ?? null,
      fetched_at: new Date().toISOString(),
    };

    if (typeof result.nxtPrice === 'number') {
      upsertPayload.nxt_price = result.nxtPrice;
      upsertPayload.nxt_change_amount = result.nxtChange ?? null;
      upsertPayload.nxt_change_percent = result.nxtChangePct ?? null;
    }

    // 정규장 종가 보존 — 가격이 있을 때만 last_close 업데이트
    if (typeof result.regularMarketPrice === 'number') {
      // 장 닫힌 시간 가격은 그날 종가로 간주
      if (isClosed) {
        upsertPayload.last_close_price = result.regularMarketPrice;
        upsertPayload.last_close_date = today;
      }
    }

    await supabase.from('stock_quote_cache').upsert(upsertPayload, {
      onConflict: 'symbol',
    });
  } catch (e) {
    console.warn('[saveQuoteCache]', (e as Error).message);
  }
}

/** "지금 외부 API 를 호출해야 하는가?" — 시장 닫혀있고 캐시 신선하면 false */
export function shouldFetchExternal(cached?: CachedQuote | null): boolean {
  if (!cached) return true;
  if (!isLiveTradingNow()) {
    // 시장 닫힘 — 캐시가 있으면 굳이 호출 안 함 (12시간 TTL)
    return !isCacheFresh(cached);
  }
  return !isCacheFresh(cached);
}

/** AI 평가 fallback 가격 — current 없으면 캐시 → last_close → null */
export function pickFallbackPrice(cached?: CachedQuote | null): number | null {
  if (!cached) return null;
  if (typeof cached.price === 'number' && cached.price > 0) return cached.price;
  if (typeof cached.last_close_price === 'number' && cached.last_close_price > 0) {
    return cached.last_close_price;
  }
  return null;
}
