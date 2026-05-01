'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Search } from 'lucide-react';
import StockMemoPanel from '@/components/stock/StockMemoPanel';
import {
  Line,
  LineChart as ReLineChart,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import dayjs from 'dayjs';
import { aggregateByTicker, computeHoldings, type StockTx } from '@/lib/stock-holdings';

type HistoryResp = {
  chart?: {
    result?: Array<{
      timestamp: number[];
      indicators: { quote: Array<{ close: number[] }> };
    }>;
  };
};

type Quote = {
  symbol: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
};

type KrxResult = { code: string; ticker: string; name: string; market: string };

type Option = { ticker: string; name: string };

const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1Y' },
];

export default function ChartPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [ticker, setTicker] = useState<string>('');
  const [tickerName, setTickerName] = useState<string>('');
  const [period, setPeriod] = useState<string>('3mo');

  const [history, setHistory] = useState<Array<{ time: string; date: string; close: number }>>([]);
  const [quote, setQuote] = useState<Quote | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 검색 UI
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<KrxResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 초기 옵션 로드 (보유 종목)
  useEffect(() => {
    (async () => {
      try {
        const txRes = await fetch('/api/stocks/transactions?limit=2000');
        const tx = await txRes.json();

        const holdings = aggregateByTicker(computeHoldings((tx.transactions ?? []) as StockTx[]));
        const merged: Option[] = holdings.map((h) => ({
          ticker: h.ticker,
          name: h.companyName || h.ticker,
        }));

        setOptions(merged);
        if (merged.length && !ticker) {
          setTicker(merged[0].ticker);
          setTickerName(merged[0].name);
        }
      } catch (e) {
        console.error('[options]', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 종목 검색 (debounced)
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stocks/krx-search?q=${encodeURIComponent(search.trim())}`);
        const json = await res.json();
        setSearchResults(Array.isArray(json) ? json : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [search]);

  // 히스토리 + 시세 로드
  const load = useCallback(async (t: string, p: string) => {
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const [hRes, qRes] = await Promise.all([
        fetch(`/api/stocks/history?ticker=${encodeURIComponent(t)}&period=${p}`),
        fetch(`/api/stocks/quote?symbols=${encodeURIComponent(t)}`),
      ]);
      if (!hRes.ok) {
        const j = await hRes.json().catch(() => ({}));
        throw new Error(j.error || `히스토리 ${hRes.status}`);
      }
      const h: HistoryResp = await hRes.json();
      const chart = h?.chart?.result?.[0];
      if (!chart) throw new Error('차트 데이터 없음');
      const ts = chart.timestamp || [];
      const closes = chart.indicators?.quote?.[0]?.close || [];
      const data = ts.map((t, i) => {
        const d = new Date(t * 1000);
        return {
          time: dayjs(d).format('YYYY-MM-DD'),
          date: dayjs(d).format('M/D'),
          close: closes[i] ?? 0,
        };
      }).filter((d) => d.close > 0);
      setHistory(data);

      const qJson = await qRes.json();
      const results: Quote[] = qJson?.quoteResponse?.result ?? [];
      setQuote(results[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
      setHistory([]);
      setQuote(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ticker) load(ticker, period);
  }, [ticker, period, load]);

  const pick = (t: string, n: string) => {
    setTicker(t);
    setTickerName(n);
    setSearch('');
    setSearchResults([]);
  };

  const yDomain = useMemo(() => {
    if (history.length === 0) return undefined;
    const values = history.map((d) => d.close);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.05;
    return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
  }, [history]);

  const priceChange = quote?.regularMarketChangePercent;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">차트</h1>
          <button
            onClick={() => ticker && load(ticker, period)}
            disabled={loading || !ticker}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {/* 종목 검색 */}
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="종목명 / 코드 / 티커 검색"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
          />
          {searching && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
              검색 중…
            </span>
          )}
        </div>

        {searchResults.length > 0 && (
          <ul className="max-h-52 overflow-y-auto rounded-2xl border border-gray-100 bg-white divide-y divide-gray-50">
            {searchResults.map((r) => (
              <li key={r.code}>
                <button
                  onClick={() => pick(r.ticker, r.name)}
                  className="w-full text-left px-4 py-2 active:bg-gray-50"
                >
                  <div className="text-sm font-medium text-gray-900">{r.name}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {r.ticker} · {r.market}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* 내 종목 칩 */}
        {options.length > 0 && !searchResults.length && (
          <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
            {options.map((o) => (
              <button
                key={o.ticker}
                onClick={() => pick(o.ticker, o.name)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  ticker === o.ticker
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                {o.name}
              </button>
            ))}
          </div>
        )}

        {/* 현재가 헤더 */}
        {ticker && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="text-xs text-gray-500">{ticker}</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {quote?.shortName || tickerName || ticker}
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-2xl font-bold text-gray-900">
                {quote?.regularMarketPrice
                  ? Math.round(quote.regularMarketPrice).toLocaleString('ko-KR')
                  : '-'}
              </span>
              {priceChange != null && (
                <span
                  className={`text-sm font-semibold ${
                    priceChange >= 0 ? 'text-red-500' : 'text-blue-500'
                  }`}
                >
                  {priceChange >= 0 ? '+' : ''}
                  {priceChange.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* 기간 선택 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                period === p.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 차트 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          {error ? (
            <div className="py-12 text-center text-sm text-red-500">{error}</div>
          ) : loading ? (
            <div className="py-16 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : history.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              {ticker ? '데이터가 없습니다' : '위에서 종목을 선택해주세요'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ReLineChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                />
                <YAxis
                  domain={yDomain as [number, number] | undefined}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                    return String(v);
                  }}
                  width={50}
                />
                <Tooltip
                  formatter={(v) => [Number(v).toLocaleString('ko-KR'), '종가']}
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as { time?: string } | undefined)?.time ?? ''
                  }
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    fontSize: 12,
                    padding: '6px 10px',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </ReLineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 종목 메모 (선택된 ticker 만) */}
        {ticker && <StockMemoPanel ticker={ticker} />}
      </div>
    </div>
  );
}
