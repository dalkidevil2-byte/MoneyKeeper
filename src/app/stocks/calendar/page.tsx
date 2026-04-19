'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronLeft as ArrowLeft, ChevronRight as ArrowRight, X } from 'lucide-react';
import dayjs from 'dayjs';
import {
  aggregateRealizedByDate,
  computeRealizedTrades,
  type StockTx,
} from '@/lib/stock-holdings';

type OwnerMap = Record<string, string>; // owner_id → name
type TxWithAccount = StockTx & {
  account?: { id: string; owner_id: string; broker_name: string };
};

export default function PLCalendarPage() {
  const [txs, setTxs] = useState<TxWithAccount[]>([]);
  const [owners, setOwners] = useState<OwnerMap>({});
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(dayjs().startOf('month'));
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, ownerRes] = await Promise.all([
        fetch('/api/stocks/transactions?limit=2000'),
        fetch('/api/stocks/owners'),
      ]);
      if (!txRes.ok) throw new Error(`HTTP ${txRes.status}`);
      const txJson = await txRes.json();
      setTxs(txJson.transactions ?? []);

      const ownerJson = await ownerRes.json();
      const map: OwnerMap = {};
      for (const o of ownerJson.owners ?? []) map[o.id] = o.name;
      setOwners(map);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trades = useMemo(() => computeRealizedTrades(txs), [txs]);
  const byDate = useMemo(() => aggregateRealizedByDate(trades), [trades]);

  // 캘린더 셀: 월의 1일이 속한 주의 일요일부터 시작 → 6주 (42칸)
  const calendarCells = useMemo(() => {
    const start = cursor.startOf('month').startOf('week'); // 일요일
    const cells: dayjs.Dayjs[] = [];
    for (let i = 0; i < 42; i++) cells.push(start.add(i, 'day'));
    return cells;
  }, [cursor]);

  // 월 합계
  const monthSum = useMemo(() => {
    const ym = cursor.format('YYYY-MM');
    let sum = 0;
    let trades = 0;
    for (const [date, agg] of byDate) {
      if (date.startsWith(ym)) {
        sum += agg.pl;
        trades += agg.trades;
      }
    }
    return { sum, trades };
  }, [cursor, byDate]);

  const selectedTrades = useMemo(() => {
    if (!selectedDate) return [];
    return trades.filter((t) => t.date === selectedDate);
  }, [selectedDate, trades]);

  // 그날의 모든 거래 (매수/매도)
  const selectedAllTxs = useMemo(() => {
    if (!selectedDate) return [];
    return txs
      .filter((t) => t.date === selectedDate)
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [selectedDate, txs]);

  const selectedDayPL = useMemo(
    () => selectedTrades.reduce((s, t) => s + t.pl, 0),
    [selectedTrades]
  );

  // account_id → 표시 라벨 (소유자 · 증권사)
  const accountLabel = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of txs) {
      if (!t.account || map[t.account_id]) continue;
      const ownerName = owners[t.account.owner_id] ?? '';
      const broker = t.account.broker_name ?? '';
      map[t.account_id] = [ownerName, broker].filter(Boolean).join(' · ');
    }
    return map;
  }, [txs, owners]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/portfolio" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">손익 캘린더</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* 월 네비 + 합계 */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setCursor(cursor.subtract(1, 'month'));
                setSelectedDate(null);
              }}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            <button
              onClick={() => {
                setCursor(dayjs().startOf('month'));
                setSelectedDate(null);
              }}
              className="text-base font-bold text-gray-900"
            >
              {cursor.format('YYYY년 M월')}
            </button>
            <button
              onClick={() => {
                setCursor(cursor.add(1, 'month'));
                setSelectedDate(null);
              }}
              className="p-2 rounded-lg hover:bg-gray-100"
            >
              <ArrowRight size={18} className="text-gray-600" />
            </button>
          </div>
          <div className="text-center mt-2">
            <span
              className={`text-lg font-bold ${
                monthSum.sum >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              {monthSum.sum >= 0 ? '+' : ''}
              {Math.round(monthSum.sum).toLocaleString('ko-KR')}
            </span>
            <span className="text-xs text-gray-400 ml-2">매도 {monthSum.trades}건</span>
          </div>
        </div>

        {/* 캘린더 */}
        <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-px text-center mb-1">
            {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
              <div
                key={d}
                className={`text-[11px] font-bold py-1 ${
                  i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* 셀 */}
          <div className="grid grid-cols-7 gap-px">
            {calendarCells.map((c, i) => {
              const ds = c.format('YYYY-MM-DD');
              const isCurMonth = c.month() === cursor.month();
              const dow = c.day();
              const agg = byDate.get(ds);
              const isSelected = selectedDate === ds;
              const isToday = c.isSame(dayjs(), 'day');
              const dayColor = !isCurMonth
                ? 'text-gray-300'
                : dow === 0
                  ? 'text-red-400'
                  : dow === 6
                    ? 'text-blue-400'
                    : 'text-gray-700';

              const hasAnyTx = txs.some((t) => t.date === ds);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(ds)}
                  disabled={!hasAnyTx}
                  className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs ${
                    isSelected
                      ? 'bg-indigo-100 ring-1 ring-indigo-400'
                      : isToday
                        ? 'ring-1 ring-gray-300'
                        : ''
                  } ${hasAnyTx ? 'active:bg-gray-50' : ''}`}
                >
                  <div className={`text-[11px] ${dayColor}`}>{c.date()}</div>
                  {agg && isCurMonth ? (
                    <div
                      className={`text-[9px] font-semibold leading-none mt-0.5 ${
                        agg.pl >= 0 ? 'text-red-500' : 'text-blue-500'
                      }`}
                    >
                      {agg.pl >= 0 ? '+' : ''}
                      {formatCompact(agg.pl)}
                    </div>
                  ) : hasAnyTx && isCurMonth ? (
                    <div className="w-1 h-1 rounded-full bg-gray-300 mt-0.5" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {loading && (
          <div className="text-center text-sm text-gray-400 py-4">불러오는 중…</div>
        )}
      </div>

      {/* 선택 날짜 상세 시트 */}
      {selectedDate && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedDate(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-start justify-between px-5 py-3 flex-shrink-0">
              <div>
                <div className="text-base font-bold text-gray-900">
                  {dayjs(selectedDate).format('YYYY년 M월 D일 (ddd)')}
                </div>
                {selectedTrades.length > 0 && (
                  <div
                    className={`text-sm font-bold mt-1 ${
                      selectedDayPL >= 0 ? 'text-red-500' : 'text-blue-500'
                    }`}
                  >
                    실현손익 {selectedDayPL >= 0 ? '+' : ''}
                    {Math.round(selectedDayPL).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-6">
              {/* 실현손익 섹션 */}
              {selectedTrades.length > 0 && (
                <section className="mb-4">
                  <div className="text-xs font-bold text-gray-500 mb-2">실현손익 (매도)</div>
                  <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                    {selectedTrades.map((t) => (
                      <li key={t.txId} className="px-4 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {t.companyName || t.ticker}
                          </div>
                          {accountLabel[t.accountId] && (
                            <div className="text-[10px] text-indigo-500 mt-0.5">
                              {accountLabel[t.accountId]}
                            </div>
                          )}
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {t.quantity}주 · 매도 {Math.round(t.sellPrice).toLocaleString('ko-KR')}
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
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* 모든 거래 내역 (매수/매도) */}
              <section>
                <div className="text-xs font-bold text-gray-500 mb-2">
                  거래 내역 ({selectedAllTxs.length}건)
                </div>
                {selectedAllTxs.length === 0 ? (
                  <div className="text-xs text-gray-400 py-4 text-center">거래 없음</div>
                ) : (
                  <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
                    {selectedAllTxs.map((t) => (
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
                              <span className="text-sm font-semibold text-gray-900 truncate">
                                {t.company_name || t.ticker}
                              </span>
                            </div>
                            {accountLabel[t.account_id] && (
                              <div className="text-[10px] text-indigo-500 mt-0.5">
                                {accountLabel[t.account_id]}
                              </div>
                            )}
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
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${Math.round(n / 10_000)}만`;
  return Math.round(n).toLocaleString('ko-KR');
}
