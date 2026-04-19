'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  aggregateByTicker,
  computeHoldings,
  computeRealizedTrades,
  type StockTx,
} from '@/lib/stock-holdings';

type Account = { id: string; owner_id: string; broker_name: string; account_number?: string };
type Tab = 'holdings' | 'accounts' | 'realized';

interface Props {
  ownerName: string;
  accountIds: string[];
  accounts: Account[];
  txs: StockTx[];                  // 이미 owner의 거래만 필터된 상태로 받음
  prices: Record<string, number>;
  onClose: () => void;
}

export default function OwnerDetailSheet({
  ownerName,
  accountIds,
  accounts,
  txs,
  prices,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('holdings');

  // 보유 (종목별 합산)
  const holdings = useMemo(() => {
    const merged = aggregateByTicker(computeHoldings(txs))
      .map((a) => {
        const cur = prices[a.ticker] ?? a.avgPrice;
        const value = a.qty * cur;
        const pl = value - a.invested;
        const pct = a.invested > 0 ? (pl / a.invested) * 100 : 0;
        return { ...a, currentPrice: cur, value, pl, pct };
      })
      .sort((x, y) => y.value - x.value);
    return merged;
  }, [txs, prices]);

  // 계좌별 통계
  const accountStats = useMemo(() => {
    return accounts
      .filter((a) => accountIds.includes(a.id))
      .map((acc) => {
        const accTxs = txs.filter((t) => t.account_id === acc.id);
        const aggHs = aggregateByTicker(computeHoldings(accTxs));
        let invested = 0;
        let current = 0;
        for (const h of aggHs) {
          invested += h.invested;
          current += h.qty * (prices[h.ticker] ?? h.avgPrice);
        }
        const realized = computeRealizedTrades(accTxs).reduce((s, t) => s + t.pl, 0);
        return {
          account: acc,
          holdingsCount: aggHs.length,
          invested,
          current,
          unrealized: current - invested,
          realized,
        };
      })
      .sort((x, y) => y.current - x.current);
  }, [accounts, accountIds, txs, prices]);

  // 실현 거래 (최근순)
  const realizedTrades = useMemo(
    () =>
      computeRealizedTrades(txs)
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [txs]
  );

  // 계좌 라벨 lookup
  const accountLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of accounts) m[a.id] = a.broker_name;
    return m;
  }, [accounts]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-indigo-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {ownerName.charAt(0)}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 truncate">{ownerName}</h3>
              <div className="text-[11px] text-gray-400">
                계좌 {accountIds.length}개 · 보유 {holdings.length}종목
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 탭 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(['holdings', 'accounts', 'realized'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {t === 'holdings' ? '보유종목' : t === 'accounts' ? '계좌별' : '실현내역'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6">
          {tab === 'holdings' &&
            (holdings.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">보유 종목이 없습니다</div>
            ) : (
              <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                {holdings.map((h) => (
                  <li key={h.ticker} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate">
                          {h.companyName || h.ticker}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {h.ticker} · {h.qty}주 · 평단{' '}
                          {Math.round(h.avgPrice).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-gray-900">
                          {Math.round(h.value).toLocaleString('ko-KR')}
                        </div>
                        <div
                          className={`text-[11px] font-semibold ${
                            h.pl >= 0 ? 'text-red-500' : 'text-blue-500'
                          }`}
                        >
                          {h.pl >= 0 ? '+' : ''}
                          {Math.round(h.pl).toLocaleString('ko-KR')} ({h.pct >= 0 ? '+' : ''}
                          {h.pct.toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'accounts' &&
            (accountStats.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">계좌가 없습니다</div>
            ) : (
              <ul className="space-y-2.5">
                {accountStats.map((s) => {
                  const pct = s.invested > 0 ? (s.unrealized / s.invested) * 100 : 0;
                  return (
                    <li
                      key={s.account.id}
                      className="bg-gray-50 rounded-2xl p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {s.account.broker_name}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {s.account.account_number || '계좌번호 없음'} · 보유 {s.holdingsCount}
                            종목
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
                      <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-gray-100 text-[11px]">
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
                    </li>
                  );
                })}
              </ul>
            ))}

          {tab === 'realized' &&
            (realizedTrades.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">매도 내역이 없습니다</div>
            ) : (
              <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                {realizedTrades.map((t) => (
                  <li
                    key={t.txId}
                    className="px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {t.companyName || t.ticker}
                      </div>
                      <div className="text-[10px] text-indigo-500 mt-0.5">
                        {t.date}
                        {accountLabel[t.accountId] && ` · ${accountLabel[t.accountId]}`}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {t.quantity}주 · 매도 {Math.round(t.sellPrice).toLocaleString('ko-KR')}{' '}
                        · 평단 {Math.round(t.avgCostAtSell).toLocaleString('ko-KR')}
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
                  </li>
                ))}
              </ul>
            ))}
        </div>
      </div>
    </div>
  );
}
