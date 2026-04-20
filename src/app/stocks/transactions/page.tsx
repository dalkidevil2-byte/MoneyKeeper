'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import StockTransactionSheet, {
  type ExistingTx,
} from '@/components/stock/StockTransactionSheet';

type TxRow = ExistingTx & {
  account?: { id: string; broker_name: string; owner_id: string };
};
type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string };

export default function StockTransactionsPage() {
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; tx: ExistingTx }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, oRes, aRes] = await Promise.all([
        fetch('/api/stocks/transactions?limit=500'),
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

  // account_id → "소유자 · 증권사" 라벨
  const accountLabel = useMemo(() => {
    const ownerMap = Object.fromEntries(owners.map((o) => [o.id, o.name]));
    const map: Record<string, string> = {};
    for (const a of accounts) {
      const owner = ownerMap[a.owner_id] ?? '';
      map[a.id] = [owner, a.broker_name].filter(Boolean).join(' · ');
    }
    return map;
  }, [owners, accounts]);

  useEffect(() => {
    load();
  }, [load]);

  // 날짜별 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, TxRow[]>();
    for (const t of txs) {
      const arr = map.get(t.date) ?? [];
      arr.push(t);
      map.set(t.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? 1 : -1));
  }, [txs]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks/portfolio" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">거래내역</h1>
          <span className="text-xs text-gray-500">{txs.length}건</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-4 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            불러오기 실패: {error}
          </div>
        )}

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-8">불러오는 중…</div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 shadow-sm border border-gray-100 text-center">
            <p className="text-sm text-gray-500">거래 내역이 없습니다.</p>
            <button
              onClick={() => setSheet({ mode: 'create' })}
              className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
            >
              첫 거래 추가하기
            </button>
          </div>
        ) : (
          grouped.map(([date, list]) => (
            <div
              key={date}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <div className="px-5 pt-3 pb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-gray-700">
                  {dayjs(date).format('M월 D일 (ddd)')}
                </h2>
                <span className="text-[11px] text-gray-400">{list.length}건</span>
              </div>
              <ul className="divide-y divide-gray-50">
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSheet({ mode: 'edit', tx: t })}
                      className="w-full text-left px-5 py-3 active:bg-gray-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                                t.type === 'BUY'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-blue-50 text-blue-600'
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
                            {t.ticker} · {t.quantity}주 × {Math.round(t.price).toLocaleString('ko-KR')}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div
                            className={`text-sm font-semibold ${
                              t.type === 'BUY' ? 'text-red-500' : 'text-blue-500'
                            }`}
                          >
                            {t.type === 'BUY' ? '-' : '+'}
                            {Math.round(t.quantity * t.price).toLocaleString('ko-KR')}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheet({ mode: 'create' })}
        className="fixed bottom-24 right-1/2 translate-x-[calc(min(50vw,256px)-32px)] w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg active:bg-indigo-700 flex items-center justify-center z-30"
        title="거래 추가"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {sheet && (
        <StockTransactionSheet
          mode={sheet.mode}
          tx={sheet.mode === 'edit' ? sheet.tx : undefined}
          onClose={() => setSheet(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
