'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  RefreshCw,
  Plus,
  List as ListIcon,
  Users,
  Calendar,
  PieChart,
  Coins,
  X,
  Star,
} from 'lucide-react';
import {
  aggregateByTicker,
  computeHoldings,
  computeRealizedPL,
  computeCashBalance,
  type StockTx,
  type CashFlow,
} from '@/lib/stock-holdings';
import StockTransactionSheet from '@/components/stock/StockTransactionSheet';
import HoldingDetailSheet from '@/components/stock/HoldingDetailSheet';

type Quote = {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  currency?: string;
};

type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string };

type SelectedHolding = {
  ticker: string;
  companyName: string;
  currentPrice: number;
  changePct?: number;
};

export default function PortfolioPage() {
  const [txs, setTxs] = useState<StockTx[]>([]);
  const [flows, setFlows] = useState<CashFlow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedHolding | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // 필터
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  // 데이터 로드 (거래 + 소유자 + 계좌)
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, oRes, aRes, fRes] = await Promise.all([
        fetch('/api/stocks/transactions?limit=2000'),
        fetch('/api/stocks/owners'),
        fetch('/api/stocks/accounts'),
        fetch('/api/stocks/cash-flows'),
      ]);
      if (!tRes.ok) throw new Error(`HTTP ${tRes.status}`);
      const tJson = await tRes.json();
      const oJson = await oRes.json();
      const aJson = await aRes.json();
      const fJson = fRes.ok ? await fRes.json() : { flows: [] };
      setTxs(tJson.transactions ?? []);
      setOwners(oJson.owners ?? []);
      setAccounts(aJson.accounts ?? []);
      setFlows(fJson.flows ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // 즐겨찾기 로드
  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch('/api/stocks/favorites');
      if (!res.ok) return;
      const j = await res.json();
      setFavorites(new Set<string>(j.tickers ?? []));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  const toggleFavorite = useCallback(
    async (ticker: string) => {
      const isFav = favorites.has(ticker);
      // 낙관적 업데이트
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(ticker);
        else next.add(ticker);
        return next;
      });
      try {
        if (isFav) {
          await fetch(`/api/stocks/favorites?ticker=${encodeURIComponent(ticker)}`, {
            method: 'DELETE',
          });
        } else {
          await fetch('/api/stocks/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker }),
          });
        }
      } catch {
        // 실패 시 롤백
        loadFavorites();
      }
    },
    [favorites, loadFavorites]
  );

  // 라벨 lookup
  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const ownerName = useMemo(
    () => Object.fromEntries(owners.map((o) => [o.id, o.name])),
    [owners]
  );

  // 필터 적용된 거래
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

  // 소유자 변경 시 비소속 계좌 필터 리셋
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

  // 보유 집계 (필터 반영)
  const holdingsByTicker = useMemo(() => computeHoldings(filteredTxs), [filteredTxs]);
  const aggregated = useMemo(
    () => aggregateByTicker(holdingsByTicker),
    [holdingsByTicker]
  );
  const realizedPL = useMemo(() => computeRealizedPL(filteredTxs), [filteredTxs]);

  // ticker별 "소유자·증권사" 라벨 (다수면 "외 N계좌")
  const holdersByTicker = useMemo(() => {
    const ownerMap = Object.fromEntries(owners.map((o) => [o.id, o.name]));
    const accLabelMap = Object.fromEntries(
      accounts.map((a) => [
        a.id,
        [ownerMap[a.owner_id], a.broker_name].filter(Boolean).join(' · '),
      ])
    );
    const map: Record<string, string[]> = {};
    for (const h of holdingsByTicker) {
      const label = accLabelMap[h.accountId];
      if (!label) continue;
      if (!map[h.ticker]) map[h.ticker] = [];
      if (!map[h.ticker].includes(label)) map[h.ticker].push(label);
    }
    return map;
  }, [holdingsByTicker, owners, accounts]);

  // 시세 조회 (모든 보유 종목 — 필터와 무관하게 전체 ticker fetch)
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
      console.error('[quote fetch]', e);
    } finally {
      setQuoteLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allTickers.length) fetchQuotes(allTickers);
  }, [allTickers, fetchQuotes]);

  // 필터 적용된 cash flows (account → owner 기준)
  const filteredFlows = useMemo(() => {
    return flows.filter((f) => {
      const acc = accountById[f.account_id];
      if (ownerFilter && acc?.owner_id !== ownerFilter) return false;
      if (accountFilter && f.account_id !== accountFilter) return false;
      return true;
    });
  }, [flows, ownerFilter, accountFilter, accountById]);

  // 합계
  const summary = useMemo(() => {
    let invested = 0;
    let current = 0;
    for (const a of aggregated) {
      invested += a.invested;
      const p = quotes[a.ticker]?.regularMarketPrice ?? a.avgPrice;
      current += a.qty * p;
    }
    const cash = computeCashBalance(filteredTxs, filteredFlows);
    const total = current + cash;
    const unrealized = current - invested;
    const unrealizedPct = invested > 0 ? (unrealized / invested) * 100 : 0;
    return { invested, current, cash, total, unrealized, unrealizedPct };
  }, [aggregated, quotes, filteredTxs, filteredFlows]);

  const sorted = useMemo(() => {
    return aggregated
      .map((a) => {
        const p = quotes[a.ticker]?.regularMarketPrice ?? a.avgPrice;
        const value = a.qty * p;
        const unrealized = value - a.invested;
        const pct = a.invested > 0 ? (unrealized / a.invested) * 100 : 0;
        return { ...a, currentPrice: p, value, unrealized, pct };
      })
      .sort((a, b) => {
        // 즐겨찾기 우선 → 그다음 평가액 내림차순
        const aFav = favorites.has(a.ticker) ? 1 : 0;
        const bFav = favorites.has(b.ticker) ? 1 : 0;
        if (aFav !== bFav) return bFav - aFav;
        return b.value - a.value;
      });
  }, [aggregated, quotes, favorites]);

  const hasFilter = ownerFilter || accountFilter;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">포트폴리오</h1>
          <Link
            href="/stocks/transactions"
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
            title="새로고침"
          >
            <RefreshCw size={18} className={quoteLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-6 space-y-4">
        {/* 요약 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-baseline justify-between">
            <div className="text-sm text-gray-500">
              {hasFilter ? '필터 총자산' : '총자산 (평가+현금)'}
            </div>
            {hasFilter && (
              <button
                onClick={() => {
                  setOwnerFilter(null);
                  setAccountFilter(null);
                }}
                className="text-[11px] text-indigo-600 font-semibold flex items-center gap-0.5"
              >
                <X size={11} />
                필터 초기화
              </button>
            )}
          </div>
          <div className="text-3xl font-bold text-gray-900 mt-1">
            {loading ? '…' : formatKRW(summary.total)}
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-sm font-semibold ${
                summary.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              {summary.unrealized >= 0 ? '+' : ''}
              {formatKRW(summary.unrealized)}
            </span>
            <span
              className={`text-xs ${
                summary.unrealizedPct >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              ({summary.unrealizedPct >= 0 ? '+' : ''}
              {summary.unrealizedPct.toFixed(2)}%)
            </span>
            <span className="text-[11px] text-gray-400 ml-1">평가손익</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-500">평가액</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">
                {formatKRW(summary.current)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Coins size={11} className="text-amber-500" /> 현금
              </div>
              <div
                className={`text-sm font-semibold mt-0.5 ${
                  summary.cash < 0 ? 'text-rose-500' : 'text-gray-800'
                }`}
              >
                {formatKRW(summary.cash)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">원금</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">
                {formatKRW(summary.invested)}
              </div>
            </div>
            <Link href="/stocks/realized" className="block active:bg-gray-50 -m-2 p-2 rounded-lg">
              <div className="text-xs text-gray-500 flex items-center gap-1">
                실현손익 <span className="text-gray-300">›</span>
              </div>
              <div
                className={`text-sm font-semibold mt-0.5 ${
                  realizedPL >= 0 ? 'text-red-500' : 'text-blue-500'
                }`}
              >
                {realizedPL >= 0 ? '+' : ''}
                {formatKRW(realizedPL)}
              </div>
            </Link>
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
                    ? 'bg-indigo-600 border-indigo-600 text-white'
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
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  {o.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 필터: 계좌 */}
        {filterableAccounts.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-gray-500 mb-1.5">계좌</div>
            <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1">
              <button
                onClick={() => setAccountFilter(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  accountFilter === null
                    ? 'bg-indigo-600 border-indigo-600 text-white'
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
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-gray-200 text-gray-700'
                  }`}
                >
                  {ownerFilter ? a.broker_name : `${ownerName[a.owner_id] ?? ''} · ${a.broker_name}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 분석 메뉴 */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { href: '/stocks/owners',   icon: Users,    label: '소유자별', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600' },
            { href: '/stocks/realized', icon: Coins,    label: '실현손익', iconBg: 'bg-amber-100',  iconColor: 'text-amber-600'  },
            { href: '/stocks/calendar', icon: Calendar, label: '캘린더',   iconBg: 'bg-rose-100',   iconColor: 'text-rose-600'   },
            { href: '/stocks/weights',  icon: PieChart, label: '비중',     iconBg: 'bg-sky-100',    iconColor: 'text-sky-600'    },
          ].map(({ href, icon: Icon, label, iconBg, iconColor }) => (
            <Link
              key={href}
              href={href}
              className="bg-white rounded-2xl py-3 shadow-sm border border-gray-100 flex flex-col items-center gap-1 active:scale-[0.96] transition-transform"
            >
              <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                <Icon size={18} className={iconColor} />
              </div>
              <span className="text-[11px] font-semibold text-gray-700">{label}</span>
            </Link>
          ))}
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            거래내역을 불러오지 못했습니다: {error}
          </div>
        )}

        {/* 보유 종목 리스트 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 pt-4 pb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-gray-900">보유 종목</h2>
            <span className="text-xs text-gray-500">{sorted.length}종목</span>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : sorted.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              {hasFilter ? '필터 조건에 보유 종목이 없습니다.' : '보유 종목이 없습니다.'}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {sorted.map((h) => {
                const isFav = favorites.has(h.ticker);
                return (
                <li key={h.ticker} className={isFav ? 'bg-amber-50/40' : ''}>
                  <div className="relative">
                  <button
                    onClick={() =>
                      setSelected({
                        ticker: h.ticker,
                        companyName: h.companyName,
                        currentPrice: h.currentPrice,
                        changePct: quotes[h.ticker]?.regularMarketChangePercent,
                      })
                    }
                    className="w-full text-left pl-12 pr-5 py-3 active:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {h.companyName || h.ticker}
                        </div>
                        {holdersByTicker[h.ticker]?.length > 0 && (
                          <div className="text-[10px] text-indigo-500 mt-0.5 truncate">
                            {holdersByTicker[h.ticker].length <= 2
                              ? holdersByTicker[h.ticker].join(' / ')
                              : `${holdersByTicker[h.ticker][0]} 외 ${holdersByTicker[h.ticker].length - 1}계좌`}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 mt-0.5">
                          {h.ticker} · {formatQty(h.qty)}주
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {formatKRW(h.value)}
                        </div>
                        <div
                          className={`text-xs mt-0.5 ${
                            h.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
                          }`}
                        >
                          {h.unrealized >= 0 ? '+' : ''}
                          {formatKRW(h.unrealized)} ({h.pct >= 0 ? '+' : ''}
                          {h.pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400 mt-2">
                      <span>평단 {formatKRW(h.avgPrice)}</span>
                      <span>
                        현재가 {formatKRW(h.currentPrice)}
                        {quotes[h.ticker]?.regularMarketChangePercent !== undefined && (
                          <span
                            className={`ml-1 ${
                              (quotes[h.ticker]?.regularMarketChangePercent ?? 0) >= 0
                                ? 'text-red-500'
                                : 'text-blue-500'
                            }`}
                          >
                            ({(quotes[h.ticker]?.regularMarketChangePercent ?? 0) >= 0 ? '+' : ''}
                            {(quotes[h.ticker]?.regularMarketChangePercent ?? 0).toFixed(2)}%)
                          </span>
                        )}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(h.ticker);
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-lg active:bg-amber-100"
                    aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기'}
                    title={isFav ? '즐겨찾기 해제' : '즐겨찾기'}
                  >
                    <Star
                      size={18}
                      className={
                        isFav
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300'
                      }
                    />
                  </button>
                  </div>
                </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* FAB: 거래 추가 */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed bottom-24 right-1/2 translate-x-[calc(min(50vw,256px)-32px)] w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg active:bg-indigo-700 flex items-center justify-center z-30"
        title="거래 추가"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {sheetOpen && (
        <StockTransactionSheet
          mode="create"
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            loadAll();
          }}
        />
      )}

      {selected && (
        <HoldingDetailSheet
          ticker={selected.ticker}
          companyName={selected.companyName}
          currentPrice={selected.currentPrice}
          changePct={selected.changePct}
          // 필터 적용된 거래만 (소유자/계좌 필터 일관성)
          txs={filteredTxs.filter((t) => t.ticker === selected.ticker)}
          accounts={accounts}
          owners={owners}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function formatKRW(n: number): string {
  if (!isFinite(n)) return '-';
  const rounded = Math.round(n);
  return rounded.toLocaleString('ko-KR');
}

function formatQty(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString('ko-KR')
    : n.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}
