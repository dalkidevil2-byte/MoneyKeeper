'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, X } from 'lucide-react';
import dayjs from 'dayjs';
import {
  aggregateRealizedByTicker,
  computeRealizedTrades,
  type StockTx,
} from '@/lib/stock-holdings';

type Tab = 'list' | 'ticker';

type TxWithAccount = StockTx & {
  account?: { id: string; owner_id: string; broker_name: string };
};
type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string };

export default function RealizedPage() {
  const [txs, setTxs] = useState<TxWithAccount[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('list');
  const [error, setError] = useState<string | null>(null);

  // 필터: null이면 전체
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, oRes, aRes] = await Promise.all([
        fetch('/api/stocks/transactions?limit=2000'),
        fetch('/api/stocks/owners'),
        fetch('/api/stocks/accounts'),
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
    load();
  }, [load]);

  // 라벨 lookup
  const ownerName: Record<string, string> = useMemo(
    () => Object.fromEntries(owners.map((o) => [o.id, o.name])),
    [owners]
  );
  const accountById: Record<string, Account> = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );

  // 필터 적용된 거래 (account → owner 매칭)
  const filteredTxs = useMemo(() => {
    return txs.filter((t) => {
      const acc = accountById[t.account_id] ?? t.account;
      if (ownerFilter && acc?.owner_id !== ownerFilter) return false;
      if (accountFilter && t.account_id !== accountFilter) return false;
      return true;
    });
  }, [txs, ownerFilter, accountFilter, accountById]);

  // 소유자 필터 변경 시 그 소유자에 안 속한 계좌 필터는 리셋
  useEffect(() => {
    if (!ownerFilter) return;
    if (accountFilter && accountById[accountFilter]?.owner_id !== ownerFilter) {
      setAccountFilter(null);
    }
  }, [ownerFilter, accountFilter, accountById]);

  // 필터에 의해 가능한 계좌 목록
  const filterableAccounts = useMemo(
    () => (ownerFilter ? accounts.filter((a) => a.owner_id === ownerFilter) : accounts),
    [accounts, ownerFilter]
  );

  const trades = useMemo(() => computeRealizedTrades(filteredTxs), [filteredTxs]);
  const tickers = useMemo(() => aggregateRealizedByTicker(trades), [trades]);
  const totalPL = useMemo(() => trades.reduce((s, t) => s + t.pl, 0), [trades]);

  // 매도 거래 날짜 내림차순
  const sortedTrades = useMemo(
    () =>
      trades.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [trades]
  );

  // 날짜별 그룹
  const grouped = useMemo(() => {
    const m = new Map<string, typeof sortedTrades>();
    for (const t of sortedTrades) {
      const arr = m.get(t.date) ?? [];
      arr.push(t);
      m.set(t.date, arr);
    }
    return Array.from(m.entries());
  }, [sortedTrades]);

  // 라벨 빌더
  const buildLabel = (accountId: string): string => {
    const acc = accountById[accountId];
    if (!acc) return '';
    const owner = ownerName[acc.owner_id] ?? '';
    const broker = acc.broker_name ?? '';
    return [owner, broker].filter(Boolean).join(' · ');
  };

  const hasFilter = ownerFilter || accountFilter;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/portfolio" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">실현손익</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* 합계 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <div className="flex items-baseline justify-between">
            <div className="text-sm text-gray-500">
              {hasFilter ? '필터 실현손익' : '실현손익 누계'}
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
          <div
            className={`text-3xl font-bold mt-1 ${
              totalPL >= 0 ? 'text-red-500' : 'text-blue-500'
            }`}
          >
            {totalPL >= 0 ? '+' : ''}
            {Math.round(totalPL).toLocaleString('ko-KR')}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            매도 {trades.length}건 · {tickers.length}종목
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

        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {(['list', 'ticker'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {t === 'list' ? '날짜별 매도' : '종목별 누계'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">불러오는 중…</div>
        ) : trades.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center">
            <p className="text-sm text-gray-500">매도 내역이 없습니다.</p>
          </div>
        ) : tab === 'list' ? (
          // 날짜별 매도 목록
          <div className="space-y-3">
            {grouped.map(([date, list]) => {
              const daySum = list.reduce((s, t) => s + t.pl, 0);
              return (
                <div
                  key={date}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
                >
                  <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                    <span className="text-sm font-bold text-gray-700">
                      {dayjs(date).format('M월 D일 (ddd)')}
                    </span>
                    <span
                      className={`text-sm font-bold ${
                        daySum >= 0 ? 'text-red-500' : 'text-blue-500'
                      }`}
                    >
                      {daySum >= 0 ? '+' : ''}
                      {Math.round(daySum).toLocaleString('ko-KR')}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-50">
                    {list.map((t) => {
                      const label = buildLabel(t.accountId);
                      return (
                        <li key={t.txId} className="px-5 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-gray-900 truncate">
                                {t.companyName || t.ticker}
                              </div>
                              {label && (
                                <div className="text-[10px] text-indigo-500 mt-0.5">{label}</div>
                              )}
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                {t.quantity}주 · 매도{' '}
                                {Math.round(t.sellPrice).toLocaleString('ko-KR')}
                                {' · 평단 '}
                                {Math.round(t.avgCostAtSell).toLocaleString('ko-KR')}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={`text-sm font-bold ${
                                  t.pl >= 0 ? 'text-red-500' : 'text-blue-500'
                                }`}
                              >
                                {t.pl >= 0 ? '+' : ''}
                                {Math.round(t.pl).toLocaleString('ko-KR')}
                              </div>
                              <div
                                className={`text-[11px] ${
                                  t.plPct >= 0 ? 'text-red-500' : 'text-blue-500'
                                }`}
                              >
                                {t.plPct >= 0 ? '+' : ''}
                                {t.plPct.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          // 종목별 누계
          <ul className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {tickers.map((t) => (
              <li key={t.ticker} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {t.companyName || t.ticker}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {t.ticker} · 매도 {t.trades}건 · 총 {t.totalQty}주
                    </div>
                  </div>
                  <div
                    className={`text-sm font-bold shrink-0 ${
                      t.totalPL >= 0 ? 'text-red-500' : 'text-blue-500'
                    }`}
                  >
                    {t.totalPL >= 0 ? '+' : ''}
                    {Math.round(t.totalPL).toLocaleString('ko-KR')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
