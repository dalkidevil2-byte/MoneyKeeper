'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import dayjs from 'dayjs';
import {
  computeHoldings,
  computeRealizedTrades,
  type StockTx,
} from '@/lib/stock-holdings';

type Account = { id: string; owner_id: string; broker_name: string };
type Owner = { id: string; name: string };
type Tab = 'accounts' | 'trades' | 'realized';

interface Props {
  ticker: string;
  companyName: string;
  currentPrice: number;
  changePct?: number;
  txs: StockTx[];        // 이미 해당 ticker 거래만 필터된 상태로 받음
  accounts: Account[];
  owners: Owner[];
  onClose: () => void;
}

export default function HoldingDetailSheet({
  ticker,
  companyName,
  currentPrice,
  changePct,
  txs,
  accounts,
  owners,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('accounts');

  const accountById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a])),
    [accounts]
  );
  const ownerName = useMemo(
    () => Object.fromEntries(owners.map((o) => [o.id, o.name])),
    [owners]
  );
  const buildLabel = (accountId: string) => {
    const acc = accountById[accountId];
    if (!acc) return '';
    return [ownerName[acc.owner_id], acc.broker_name].filter(Boolean).join(' · ');
  };

  // 계좌별 보유 분해
  const byAccount = useMemo(() => {
    const holdings = computeHoldings(txs);
    return holdings
      .map((h) => {
        const value = h.qty * currentPrice;
        const invested = h.qty * h.avgPrice;
        const pl = value - invested;
        const pct = invested > 0 ? (pl / invested) * 100 : 0;
        return { ...h, invested, value, pl, pct, label: buildLabel(h.accountId) };
      })
      .sort((a, b) => b.value - a.value);
  }, [txs, currentPrice]); // eslint-disable-line react-hooks/exhaustive-deps

  // 종목 합계
  const summary = useMemo(() => {
    let qty = 0;
    let invested = 0;
    for (const h of byAccount) {
      qty += h.qty;
      invested += h.invested;
    }
    const value = qty * currentPrice;
    const avg = qty > 0 ? invested / qty : 0;
    const pl = value - invested;
    const pct = invested > 0 ? (pl / invested) * 100 : 0;
    return { qty, invested, value, avg, pl, pct };
  }, [byAccount, currentPrice]);

  // 매수/매도 거래 (최근순)
  const sortedTxs = useMemo(
    () =>
      txs
        .slice()
        .sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : a.created_at < b.created_at ? 1 : -1
        ),
    [txs]
  );

  // 종목 실현손익
  const realized = useMemo(() => computeRealizedTrades(txs), [txs]);
  const realizedSum = useMemo(() => realized.reduce((s, t) => s + t.pl, 0), [realized]);

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

        {/* 헤더 */}
        <div className="flex items-start justify-between px-5 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900 truncate">
              {companyName || ticker}
            </h3>
            <div className="text-[11px] text-gray-400">{ticker}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 종목 요약 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="bg-gray-50 rounded-2xl p-3.5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-[11px] text-gray-500">평가액</div>
                <div className="text-xl font-bold text-gray-900">
                  {Math.round(summary.value).toLocaleString('ko-KR')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] text-gray-500">현재가</div>
                <div className="text-base font-bold text-gray-900">
                  {Math.round(currentPrice).toLocaleString('ko-KR')}
                </div>
                {changePct != null && (
                  <div
                    className={`text-[11px] font-semibold ${
                      changePct >= 0 ? 'text-red-500' : 'text-blue-500'
                    }`}
                  >
                    {changePct >= 0 ? '+' : ''}
                    {changePct.toFixed(2)}%
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-200 text-[11px]">
              <div>
                <div className="text-gray-400">보유</div>
                <div className="text-gray-900 font-semibold mt-0.5">
                  {summary.qty}주
                </div>
              </div>
              <div>
                <div className="text-gray-400">평단</div>
                <div className="text-gray-900 font-semibold mt-0.5">
                  {Math.round(summary.avg).toLocaleString('ko-KR')}
                </div>
              </div>
              <div>
                <div className="text-gray-400">미실현</div>
                <div
                  className={`font-semibold mt-0.5 ${
                    summary.pl >= 0 ? 'text-red-500' : 'text-blue-500'
                  }`}
                >
                  {summary.pl >= 0 ? '+' : ''}
                  {Math.round(summary.pl).toLocaleString('ko-KR')}
                  <div className="text-[10px]">
                    ({summary.pct >= 0 ? '+' : ''}
                    {summary.pct.toFixed(2)}%)
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {(
              [
                ['accounts', '계좌별'],
                ['trades', '매매내역'],
                ['realized', '실현손익'],
              ] as Array<[Tab, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto flex-1 px-5 pb-6">
          {tab === 'accounts' &&
            (byAccount.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">계좌별 분해 없음</div>
            ) : (
              <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                {byAccount.map((h) => (
                  <li
                    key={h.accountId}
                    className="px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 truncate">
                        {h.label || '(계좌 정보 없음)'}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {h.qty}주 · 평단 {Math.round(h.avgPrice).toLocaleString('ko-KR')}
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
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'trades' &&
            (sortedTxs.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">거래 없음</div>
            ) : (
              <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                {sortedTxs.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              t.type === 'BUY'
                                ? 'bg-red-100 text-red-600'
                                : 'bg-blue-100 text-blue-600'
                            }`}
                          >
                            {t.type === 'BUY' ? '매수' : '매도'}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">
                            {dayjs(t.date).format('YYYY.MM.DD')}
                          </span>
                        </div>
                        <div className="text-[10px] text-indigo-500 mt-0.5">
                          {buildLabel(t.account_id)}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {t.quantity}주 × {Math.round(t.price).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-semibold shrink-0 ${
                          t.type === 'BUY' ? 'text-red-500' : 'text-blue-500'
                        }`}
                      >
                        {t.type === 'BUY' ? '-' : '+'}
                        {Math.round(t.quantity * t.price).toLocaleString('ko-KR')}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ))}

          {tab === 'realized' && (
            <>
              <div className="bg-gray-50 rounded-2xl p-3 mb-3 flex items-baseline justify-between">
                <span className="text-xs text-gray-500">실현손익 누계</span>
                <span
                  className={`text-base font-bold ${
                    realizedSum >= 0 ? 'text-red-500' : 'text-blue-500'
                  }`}
                >
                  {realizedSum >= 0 ? '+' : ''}
                  {Math.round(realizedSum).toLocaleString('ko-KR')}
                </span>
              </div>
              {realized.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">매도 내역 없음</div>
              ) : (
                <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                  {realized
                    .slice()
                    .sort((a, b) => (a.date < b.date ? 1 : -1))
                    .map((t) => (
                      <li
                        key={t.txId}
                        className="px-4 py-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900">
                            {dayjs(t.date).format('YYYY.MM.DD')}
                          </div>
                          <div className="text-[10px] text-indigo-500 mt-0.5">
                            {buildLabel(t.accountId)}
                          </div>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {t.quantity}주 · 매도{' '}
                            {Math.round(t.sellPrice).toLocaleString('ko-KR')} · 평단{' '}
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
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
