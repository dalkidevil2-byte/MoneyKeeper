/**
 * StockWeb에서 이관한 시세 프록시 유틸.
 * - Yahoo Finance 1차, Naver 2차 폴백 (한국 주식)
 * - 모듈 스코프 in-memory 캐시 (서버리스 인스턴스 생존 동안 유효)
 */

// ─── User-Agent 풀 (클라우드 IP 차단 우회) ───────────────────────
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
];
export function yfHeaders(): HeadersInit {
  return { 'User-Agent': UA_POOL[Math.floor(Math.random() * UA_POOL.length)] };
}
export function randomUA(): string {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

// ─── 캐시 (모듈 스코프, 인스턴스 lifetime) ────────────────────────
export type QuoteResult = {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  marketState?: string;
  source?: string;
};

const PRICE_CACHE = new Map<string, QuoteResult>();
export function savePriceCache(symbol: string, result: QuoteResult) {
  PRICE_CACHE.set(symbol, result);
}
export function loadPriceCache(symbol: string): QuoteResult | null {
  return PRICE_CACHE.get(symbol) ?? null;
}

const HIST_MEM_TTL = 6 * 60 * 60 * 1000;
const HIST_CACHE = new Map<string, { data: unknown; ts: number }>();
export function saveHistoryCache(key: string, data: unknown) {
  HIST_CACHE.set(key, { data, ts: Date.now() });
}
export function loadHistoryCache(key: string): unknown | null {
  const entry = HIST_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > HIST_MEM_TTL) return null;
  return entry.data;
}

// ─── 네이버 시세 폴백 (한국 주식 전용) ──────────────────────────
export async function naverQuoteFallback(symbol: string): Promise<QuoteResult | null> {
  const match = symbol.match(/^(\d{6})\.(KS|KQ)$/);
  if (!match) return null;
  const code = match[1];
  try {
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const response = await fetch(url, {
      headers: { 'User-Agent': randomUA(), Referer: 'https://m.stock.naver.com/' },
    });
    const data = await response.json();
    const price = parseFloat(String(data.closePrice || data.currentPrice || '0').replace(/,/g, ''));
    const changeAmt = parseFloat(String(data.compareToPreviousClosePrice || '0').replace(/,/g, ''));
    const changePct = parseFloat(String(data.fluctuationsRatio || '0').replace(/,/g, ''));
    if (!price) return null;
    return {
      symbol,
      shortName: data.stockName || symbol,
      regularMarketPrice: price,
      regularMarketPreviousClose: price - changeAmt,
      regularMarketChange: changeAmt,
      regularMarketChangePercent: changePct,
      currency: 'KRW',
      marketState: 'CLOSED',
      source: 'naver',
    };
  } catch (e) {
    console.error('[naverQuoteFallback]', symbol, (e as Error).message);
    return null;
  }
}

// ─── 네이버 히스토리 폴백 (한국 주식 전용) ──────────────────────
export type ChartResponse = {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: number[]; open?: number[]; high?: number[]; low?: number[]; volume?: number[] }> };
    }>;
    error: null | unknown;
  };
};

export async function naverHistoryFallback(symbol: string, period: string): Promise<ChartResponse | null> {
  const match = symbol.match(/^(\d{6})\.(KS|KQ)$/);
  if (!match) return null;
  const code = match[1];
  const daysMap: Record<string, number> = { '1mo': 35, '3mo': 95, '6mo': 190, '1y': 370 };
  const days = daysMap[period] ?? 95;
  const endDate = new Date();
  const startDate = new Date(Date.now() - days * 86400000);
  const fmt = (d: Date) =>
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    '000000';

  try {
    const url =
      `https://api.stock.naver.com/chart/domestic/item/${code}/day` +
      `?startDateTime=${fmt(startDate)}&endDateTime=${fmt(endDate)}&isAdjusted=true`;
    const resp = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        Referer: 'https://finance.naver.com/',
        Accept: 'application/json',
      },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) throw new Error('empty response');

    const timestamps: number[] = [];
    const closes: number[] = [];
    const opens: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const volumes: number[] = [];
    for (const item of data) {
      // Naver 응답은 localDate 필드 사용 (구 localDateTime과 호환 유지)
      const raw = String(item.localDate ?? item.localDateTime ?? '');
      const dateStr =
        raw.length >= 8 && /^\d{8}/.test(raw)
          ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
          : raw.slice(0, 10);
      const close = Number(item.closePrice);
      if (!dateStr || !close) continue;
      timestamps.push(Math.floor(new Date(dateStr + 'T09:00:00+09:00').getTime() / 1000));
      closes.push(close);
      opens.push(Number(item.openPrice) || close);
      highs.push(Number(item.highPrice) || close);
      lows.push(Number(item.lowPrice) || close);
      volumes.push(Number(item.accumulatedTradingVolume) || 0);
    }
    if (!timestamps.length) throw new Error('no valid data points');

    return {
      chart: {
        result: [
          {
            timestamp: timestamps,
            indicators: {
              quote: [{ close: closes, open: opens, high: highs, low: lows, volume: volumes }],
            },
          },
        ],
        error: null,
      },
    };
  } catch (e) {
    console.warn('[naverHistoryFallback]', symbol, (e as Error).message);
    return null;
  }
}

// ─── OHLC 파서 ──────────────────────────────────────────────────
export type OhlcPoint = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export function parseOhlcFromChart(data: unknown, period: string): OhlcPoint[] | null {
  const d = data as ChartResponse;
  const chart = d?.chart?.result?.[0];
  if (!chart) return null;
  const ts = chart.timestamp || [];
  const q = chart.indicators?.quote?.[0] || ({} as ChartResponse['chart']['result'][0]['indicators']['quote'][0]);
  const raw: OhlcPoint[] = ts
    .map((t: number, i: number) => ({
      time: new Date(t * 1000).toISOString().split('T')[0],
      open: q.open?.[i] ?? 0,
      high: q.high?.[i] ?? 0,
      low: q.low?.[i] ?? 0,
      close: q.close?.[i] ?? 0,
      volume: q.volume?.[i] ?? 0,
    }))
    .filter((d) => d.close > 0);
  const byDate: Record<string, OhlcPoint> = {};
  raw.forEach((d) => {
    byDate[d.time] = d;
  });
  let result = Object.values(byDate).sort((a, b) => a.time.localeCompare(b.time));
  if (period === '1mo') {
    const cutoff = new Date(Date.now() - 32 * 86400000).toISOString().split('T')[0];
    result = result.filter((d) => d.time >= cutoff);
  }
  return result.length > 0 ? result : null;
}
