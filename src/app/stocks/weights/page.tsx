'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { Pie, PieChart, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { aggregateByTicker, computeHoldings, type StockTx } from '@/lib/stock-holdings';

type Quote = { symbol: string; regularMarketPrice?: number };

const COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#a855f7',
  '#06b6d4', '#84cc16',
];

export default function WeightsPage() {
  const [txs, setTxs] = useState<StockTx[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/stocks/transactions?limit=2000');
      const json = await res.json();
      setTxs(json.transactions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const aggregated = useMemo(() => aggregateByTicker(computeHoldings(txs)), [txs]);

  const fetchPrices = useCallback(async () => {
    const tickers = aggregated.map((a) => a.ticker);
    if (!tickers.length) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(tickers.join(','))}`);
      const json = await res.json();
      const results: Quote[] = json?.quoteResponse?.result ?? [];
      const map: Record<string, number> = {};
      for (const r of results) {
        if (r.regularMarketPrice != null) map[r.symbol] = r.regularMarketPrice;
      }
      setPrices(map);
    } finally {
      setQuoteLoading(false);
    }
  }, [aggregated]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const data = useMemo(() => {
    const enriched = aggregated.map((a) => {
      const cur = prices[a.ticker] ?? a.avgPrice;
      return {
        ticker: a.ticker,
        name: a.companyName || a.ticker,
        value: a.qty * cur,
      };
    });
    enriched.sort((a, b) => b.value - a.value);
    // Top 10 + 기타
    if (enriched.length > 10) {
      const top = enriched.slice(0, 10);
      const restValue = enriched.slice(10).reduce((s, e) => s + e.value, 0);
      top.push({ ticker: '_etc', name: `기타 ${enriched.length - 10}종목`, value: restValue });
      return top;
    }
    return enriched;
  }, [aggregated, prices]);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/portfolio" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">종목 비중</h1>
          <button
            onClick={() => {
              load();
              fetchPrices();
            }}
            disabled={loading || quoteLoading}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={18} className={quoteLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">불러오는 중…</div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center text-sm text-gray-500">
            보유 종목이 없습니다.
          </div>
        ) : (
          <>
            {/* 파이차트 */}
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="white" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => Number(v).toLocaleString('ko-KR')}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      fontSize: 12,
                      padding: '6px 10px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="text-center mt-2">
                <div className="text-xs text-gray-500">총 평가액</div>
                <div className="text-xl font-bold text-gray-900">
                  {Math.round(total).toLocaleString('ko-KR')}
                </div>
              </div>
            </div>

            {/* 비중 리스트 */}
            <ul className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {data.map((d, i) => {
                const pct = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <li key={d.ticker} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {d.name}
                        </div>
                        {d.ticker !== '_etc' && (
                          <div className="text-[11px] text-gray-400">{d.ticker}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-900">
                          {pct.toFixed(1)}%
                        </div>
                        <div className="text-[11px] text-gray-400">
                          {Math.round(d.value).toLocaleString('ko-KR')}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
