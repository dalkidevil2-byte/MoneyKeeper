'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import {
  computeHoldings,
  aggregateByTicker,
  computeOwnerStats,
  type StockTx,
  type OwnerStat,
} from '@/lib/stock-holdings';
import OwnerDetailSheet from '@/components/stock/OwnerDetailSheet';

type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string; account_number?: string };
type Quote = { symbol: string; regularMarketPrice?: number };

export default function OwnersStatsPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<StockTx[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<OwnerStat | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [oRes, aRes, tRes] = await Promise.all([
        fetch('/api/stocks/owners'),
        fetch('/api/stocks/accounts'),
        fetch('/api/stocks/transactions?limit=2000'),
      ]);
      const o = await oRes.json();
      const a = await aRes.json();
      const t = await tRes.json();
      setOwners(o.owners ?? []);
      setAccounts(a.accounts ?? []);
      setTxs(t.transactions ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 보유 종목 시세 fetch
  const tickers = useMemo(
    () => [...new Set(aggregateByTicker(computeHoldings(txs)).map((h) => h.ticker))],
    [txs]
  );

  const fetchPrices = useCallback(async () => {
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
    } catch (e) {
      console.error('[prices]', e);
    } finally {
      setQuoteLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  const stats: OwnerStat[] = useMemo(
    () => computeOwnerStats(txs, owners, accounts, prices),
    [txs, owners, accounts, prices]
  );

  const totals = useMemo(() => {
    const invested = stats.reduce((s, o) => s + o.invested, 0);
    const current = stats.reduce((s, o) => s + o.current, 0);
    const realized = stats.reduce((s, o) => s + o.realized, 0);
    const unrealized = current - invested;
    return { invested, current, realized, unrealized };
  }, [stats]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/portfolio" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">소유자별 손익</h1>
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
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* 전체 합계 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500">전체 합계</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {Math.round(totals.current).toLocaleString('ko-KR')}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100 text-xs">
            <div>
              <div className="text-gray-400">원금</div>
              <div className="text-gray-800 font-semibold mt-0.5">
                {Math.round(totals.invested).toLocaleString('ko-KR')}
              </div>
            </div>
            <div>
              <div className="text-gray-400">미실현</div>
              <div
                className={`font-semibold mt-0.5 ${
                  totals.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {totals.unrealized >= 0 ? '+' : ''}
                {Math.round(totals.unrealized).toLocaleString('ko-KR')}
              </div>
            </div>
            <div>
              <div className="text-gray-400">실현</div>
              <div
                className={`font-semibold mt-0.5 ${
                  totals.realized >= 0 ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {totals.realized >= 0 ? '+' : ''}
                {Math.round(totals.realized).toLocaleString('ko-KR')}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">불러오는 중…</div>
        ) : stats.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center text-sm text-gray-500">
            소유자가 없습니다.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {stats
              .slice()
              .sort((a, b) => b.current - a.current)
              .map((s) => {
                const pct = s.invested > 0 ? (s.unrealized / s.invested) * 100 : 0;
                return (
                  <li key={s.ownerId}>
                    <button
                      onClick={() => setSelectedOwner(s)}
                      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 active:scale-[0.98] transition-transform"
                    >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {s.ownerName.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-gray-900">{s.ownerName}</div>
                        <div className="text-[11px] text-gray-400">
                          계좌 {s.accountIds.length}개 · 보유 {s.holdingsCount}종목
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-900">
                          {Math.round(s.current).toLocaleString('ko-KR')}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            s.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
                          }`}
                        >
                          {s.unrealized >= 0 ? '+' : ''}
                          {Math.round(s.unrealized).toLocaleString('ko-KR')} ({pct >= 0 ? '+' : ''}
                          {pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-100 text-[11px]">
                      <div>
                        <div className="text-gray-400">원금</div>
                        <div className="text-gray-800 font-semibold mt-0.5">
                          {Math.round(s.invested).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">실현손익</div>
                        <div
                          className={`font-semibold mt-0.5 ${
                            s.realized >= 0 ? 'text-red-500' : 'text-blue-500'
                          }`}
                        >
                          {s.realized >= 0 ? '+' : ''}
                          {Math.round(s.realized).toLocaleString('ko-KR')}
                        </div>
                      </div>
                    </div>
                    </button>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {selectedOwner && (
        <OwnerDetailSheet
          ownerName={selectedOwner.ownerName}
          accountIds={selectedOwner.accountIds}
          accounts={accounts}
          txs={txs.filter((t) => selectedOwner.accountIds.includes(t.account_id))}
          prices={prices}
          onClose={() => setSelectedOwner(null)}
        />
      )}
    </div>
  );
}
