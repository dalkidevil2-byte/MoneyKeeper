'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Plus, List as ListIcon, X, FlaskConical } from 'lucide-react';
import {
  aggregateByTicker,
  computeHoldings,
  computeRealizedPL,
  type StockTx,
} from '@/lib/stock-holdings';
import StockTransactionSheet from '@/components/stock/StockTransactionSheet';
import HoldingDetailSheet from '@/components/stock/HoldingDetailSheet';

type Quote = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
};

type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string };

type SelectedHolding = {
  ticker: string;
  companyName: string;
  currentPrice: number;
  changePct?: number;
};

const API_BASE = '/api/stocks/paper' as const;

export default function PaperPortfolioPage() {
  const [txs, setTxs] = useState<StockTx[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedHolding | null>(null);

  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, oRes, aRes] = await Promise.all([
        fetch(`${API_BASE}/transactions?limit=2000`),
        fetch(`${API_BASE}/owners`),
        fetch(`${API_BASE}/accounts`),
      ]);
      if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
      const tJson = await tRes.json();
      const oJson = await oRes.json();
      const aJson = await aRes.json();
      setTxs(tJson.transactions ?? []);
      setOwners(oJson.owners ?? []);
      setAccounts(aJson.accounts ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const ownerName = useMemo(
    () => Object.fromEntries(owners.map((o) => [o.id, o.name])),
    [owners]
  );

  const filteredTxs = useMemo(
    () =>
      txs.filter((t) => {
        const acc = accountById[t.account_id];
        if (ownerFilter && acc?.owner_id !== ownerFilter) return false;
        if (accountFilter && t.account_id !== accountFilter) return false;
        return true;
      }),
    [txs, ownerFilter, accountFilter, accountById]
  );

  useEffect(() => {
    if (!ownerFilter) return;
    if (accountFilter && accountById[accountFilter]?.owner_id !== ownerFilter) {
      setAccountFilter(null);
    }
  }, [ownerFilter, accountFilter, accountById]);

  const filterableAccounts = useMemo(
    () => (ownerFilter ? accounts.filter((a) => a.owner_id === ownerFilter) : accounts),
    [accounts, ownerFilter]
  );

  const aggregated = useMemo(
    () => aggregateByTicker(computeHoldings(filteredTxs)),
    [filteredTxs]
  );
  const realizedPL = useMemo(() => computeRealizedPL(filteredTxs), [filteredTxs]);

  const allTickers = useMemo(
    () => [...new Set(aggregateByTicker(computeHoldings(txs)).map((a) => a.ticker))],
    [txs]
  );

  const fetchQuotes = useCallback(async (tickers: string[]) => {
    if (!tickers.length) return;
    setQuoteLoading(true);
    try {
      const res = await fetch(`/api/stocks/quote?symbols=${encodeURIComponent(tickers.join(','))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const results: Quote[] = json?.quoteResponse?.result ?? [];
      const map: Record<string, Quote> = {};
      for (const q of results) map[q.symbol] = q;
      setQuotes((prev) => ({ ...prev, ...map }));
    } catch (e) {
      console.error('[paper quote]', e);
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allTickers.length) fetchQuotes(allTickers);
  }, [allTickers, fetchQuotes]);

  const summary = useMemo(() => {
    let invested = 0;
    let current = 0;
    for (const a of aggregated) {
      invested += a.invested;
      const p = quotes[a.ticker]?.regularMarketPrice ?? a.avgPrice;
      current += a.qty * p;
    }
    const unrealized = current - invested;
    const unrealizedPct = invested > 0 ? (unrealized / invested) * 100 : 0;
    return { invested, current, unrealized, unrealizedPct };
  }, [aggregated, quotes]);

  const sorted = useMemo(() => {
    return aggregated
      .map((a) => {
        const p = quotes[a.ticker]?.regularMarketPrice ?? a.avgPrice;
        const value = a.qty * p;
        const unrealized = value - a.invested;
        const pct = a.invested > 0 ? (unrealized / a.invested) * 100 : 0;
        return { ...a, currentPrice: p, value, unrealized, pct };
      })
      .sort((a, b) => b.value - a.value);
  }, [aggregated, quotes]);

  const hasFilter = ownerFilter || accountFilter;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/paper" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <FlaskConical size={16} className="text-violet-500" />
          <h1 className="text-lg font-bold text-gray-900 flex-1">모의 포트폴리오</h1>
          <Link
            href="/stocks/paper/transactions"
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600"
            title="거래내역"
          >
            <ListIcon size={18} />
          </Link>
          <button
            onClick={() => {
              loadAll();
              fetchQuotes(allTickers);
            }}
            disabled={quoteLoading}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 disabled:opacity-50"
          >
            <RefreshCw size={18} className={quoteLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-6 space-y-4">
        {/* 요약 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100">
          <div className="flex items-baseline justify-between">
            <div className="text-sm text-violet-600 font-semibold">
              {hasFilter ? '필터 평가액' : '모의 평가액'}
            </div>
            {hasFilter && (
              <button
                onClick={() => {
                  setOwnerFilter(null);
                  setAccountFilter(null);
                }}
                className="text-[11px] text-violet-600 font-semibold flex items-center gap-0.5"
              >
                <X size={11} />
                필터 초기화
              </button>
            )}
          </div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            {loading ? '…' : Math.round(summary.current).toLocaleString('ko-KR')}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-sm font-semibold ${
                summary.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              {summary.unrealized >= 0 ? '+' : ''}
              {Math.round(summary.unrealized).toLocaleString('ko-KR')}
            </span>
            <span
              className={`text-xs ${
                summary.unrealizedPct >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              ({summary.unrealizedPct >= 0 ? '+' : ''}
              {summary.unrealizedPct.toFixed(2)}%)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-500">원금</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">
                {Math.round(summary.invested).toLocaleString('ko-KR')}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">실현손익</div>
              <div
                className={`text-sm font-semibold mt-0.5 ${
                  realizedPL >= 0 ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {realizedPL >= 0 ? '+' : ''}
                {Math.round(realizedPL).toLocaleString('ko-KR')}
              </div>
            </div>
          </div>
        </div>

        {/* 필터: 소유자 */}
        {owners.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5">소유자</div>
            <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
              <button
                onClick={() => setOwnerFilter(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  ownerFilter === null
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                전체
              </button>
              {owners.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOwnerFilter(o.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    ownerFilter === o.id
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {filterableAccounts.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5">계좌</div>
            <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
              <button
                onClick={() => setAccountFilter(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  accountFilter === null
                    ? 'bg-violet-600 border-violet-600 text-white'
                    : 'bg-white border-gray-200 text-gray-700'
                }`}
              >
                전체
              </button>
              {filterableAccounts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAccountFilter(a.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                    accountFilter === a.id
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  {ownerFilter ? a.broker_name : `${ownerName[a.owner_id] ?? ''} · ${a.broker_name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-gray-900">모의 보유</h2>
            <span className="text-xs text-gray-500">{sorted.length}종목</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : sorted.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              {owners.length === 0
                ? '먼저 모의 소유자/계좌를 만들어주세요.'
                : hasFilter
                  ? '필터 조건에 보유 종목이 없습니다.'
                  : '모의 보유 종목이 없습니다.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sorted.map((h) => (
                <li key={h.ticker}>
                  <button
                    onClick={() =>
                      setSelected({
                        ticker: h.ticker,
                        companyName: h.companyName,
                        currentPrice: h.currentPrice,
                        changePct: quotes[h.ticker]?.regularMarketChangePercent,
                      })
                    }
                    className="w-full text-left px-5 py-3 active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {h.companyName || h.ticker}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {h.ticker} · {h.qty}주
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {Math.round(h.value).toLocaleString('ko-KR')}
                        </div>
                        <div
                          className={`text-xs mt-0.5 ${
                            h.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
                          }`}
                        >
                          {h.unrealized >= 0 ? '+' : ''}
                          {Math.round(h.unrealized).toLocaleString('ko-KR')} ({h.pct >= 0 ? '+' : ''}
                          {h.pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400 mt-2">
                      <span>평단 {Math.round(h.avgPrice).toLocaleString('ko-KR')}</span>
                      <span>현재가 {Math.round(h.currentPrice).toLocaleString('ko-KR')}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-1/2 translate-x-[calc(min(50vw,256px)-32px)] w-14 h-14 rounded-full bg-violet-600 text-white shadow-lg active:bg-violet-700 flex items-center justify-center z-30"
        title="모의 거래 추가"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {sheetOpen && (
        <StockTransactionSheet
          mode="create"
          apiBase={API_BASE}
          onClose={() => setSheetOpen(false)}
          onSaved={() => loadAll()}
        />
      )}

      {selected && (
        <HoldingDetailSheet
          ticker={selected.ticker}
          companyName={selected.companyName}
          currentPrice={selected.currentPrice}
          changePct={selected.changePct}
          txs={filteredTxs.filter((t) => t.ticker === selected.ticker)}
          accounts={accounts}
          owners={owners}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
