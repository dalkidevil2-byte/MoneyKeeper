'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, Camera } from 'lucide-react';
import dayjs from 'dayjs';
import StockTransactionSheet, {
  type ExistingTx,
} from '@/components/stock/StockTransactionSheet';
import StockImportFromImage from '@/components/stock/StockImportFromImage';
import { computeRealizedTrades, type StockTx } from '@/lib/stock-holdings';

type TxRow = ExistingTx & {
  account?: { id: string; broker_name: string; owner_id: string };
  created_at?: string;
};
type Owner = { id: string; name: string };
type Account = { id: string; owner_id: string; broker_name: string };
type QuoteEntry = { price: number; currency?: string };

export default function StockTransactionsPage() {
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteEntry>>({});
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; tx: ExistingTx }
    | null
  >(null);
  const [importing, setImporting] = useState(false);

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

  // 거래 로드 후 고유 ticker 들의 현재가 조회
  useEffect(() => {
    if (txs.length === 0) return;
    const symbols = Array.from(new Set(txs.map((t) => t.ticker).filter(Boolean)));
    if (symbols.length === 0) return;
    let cancelled = false;
    setQuotesLoading(true);
    fetch(`/api/stocks/quote?symbols=${encodeURIComponent(symbols.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (cancelled) return;
        const results: Array<{
          symbol: string;
          regularMarketPrice?: number;
          currency?: string;
        }> = j?.quoteResponse?.result ?? j?.results ?? [];
        const map: Record<string, QuoteEntry> = {};
        for (const r of results) {
          if (r.symbol && typeof r.regularMarketPrice === 'number') {
            map[r.symbol] = { price: r.regularMarketPrice, currency: r.currency };
          }
        }
        setQuotes(map);
      })
      .catch(() => {
        // 시세 실패해도 페이지는 계속 동작
      })
      .finally(() => {
        if (!cancelled) setQuotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [txs]);

  // 매수 lot별 FIFO 잔여수량 맵 (buy txId → 잔여 주식수)
  const buyRemainMap = useMemo(() => {
    const byKey = new Map<string, TxRow[]>();
    for (const t of txs) {
      const key = `${t.account_id}-${t.ticker}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(t);
    }
    const result: Record<string, number> = {};
    for (const list of byKey.values()) {
      const sorted = list
        .slice()
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            (a.created_at ?? '').localeCompare(b.created_at ?? '')
        );
      const lots: { txId: string; remaining: number }[] = [];
      for (const t of sorted) {
        if (t.type === 'BUY') {
          lots.push({ txId: t.id, remaining: t.quantity });
        } else {
          let toSell = t.quantity;
          for (const lot of lots) {
            if (toSell <= 0) break;
            const take = Math.min(lot.remaining, toSell);
            lot.remaining -= take;
            toSell -= take;
          }
        }
      }
      for (const lot of lots) result[lot.txId] = lot.remaining;
    }
    return result;
  }, [txs]);

  // 매도 거래별 실현손익 맵 (txId → { pl, plPct, avgCostAtSell, sellQty })
  const realizedMap = useMemo(() => {
    const trades = computeRealizedTrades(txs as unknown as StockTx[]);
    const map: Record<
      string,
      { pl: number; plPct: number; avgCostAtSell: number; quantity: number }
    > = {};
    for (const r of trades) {
      map[r.txId] = {
        pl: r.pl,
        plPct: r.plPct,
        avgCostAtSell: r.avgCostAtSell,
        quantity: r.quantity,
      };
    }
    return map;
  }, [txs]);

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
                {list.map((t) => {
                  const q = quotes[t.ticker];
                  const cost = t.quantity * t.price;
                  const isBuy = t.type === 'BUY';
                  // 매수: FIFO 잔여수량 기준 현재가 평가/손익
                  const remainQty = isBuy ? buyRemainMap[t.id] ?? t.quantity : 0;
                  const remainCost = isBuy ? remainQty * t.price : 0;
                  const evalAmount = isBuy && q && remainQty > 0 ? remainQty * q.price : null;
                  const evalDiff = evalAmount != null ? evalAmount - remainCost : null;
                  const evalPct =
                    evalAmount != null && remainCost > 0
                      ? (evalDiff! / remainCost) * 100
                      : null;
                  const isFullySold = isBuy && remainQty === 0 && t.quantity > 0;
                  // 매도: 거래 시점 평단가 기준 실현손익
                  const realized = !isBuy ? realizedMap[t.id] ?? null : null;
                  const isKR = /\.(KS|KQ)$/i.test(t.ticker);
                  const fmtPrice = (n: number) =>
                    isKR
                      ? Math.round(n).toLocaleString('ko-KR')
                      : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
                  return (
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
                              {t.ticker} · {t.quantity}주 × {fmtPrice(t.price)}
                            </div>
                            {isBuy && q && evalAmount != null && (
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                {remainQty < t.quantity && (
                                  <span className="text-amber-600 font-semibold mr-1">
                                    잔여 {remainQty}주
                                  </span>
                                )}
                                현재가{' '}
                                <span className="font-semibold text-gray-700">
                                  {fmtPrice(q.price)}
                                </span>
                                {' · '}평가{' '}
                                <span className="font-semibold text-gray-800">
                                  {Math.round(evalAmount).toLocaleString('ko-KR')}
                                </span>
                              </div>
                            )}
                            {isFullySold && (
                              <div className="text-[11px] text-gray-400 mt-0.5">
                                전량 매도 완료
                              </div>
                            )}
                            {!isBuy && realized && (
                              <div className="text-[11px] text-gray-500 mt-0.5">
                                평단{' '}
                                <span className="font-semibold text-gray-700">
                                  {fmtPrice(realized.avgCostAtSell)}
                                </span>
                                {' · '}원금{' '}
                                <span className="font-semibold text-gray-800">
                                  {Math.round(
                                    realized.quantity * realized.avgCostAtSell
                                  ).toLocaleString('ko-KR')}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-sm font-semibold ${
                                t.type === 'BUY' ? 'text-red-500' : 'text-blue-500'
                              }`}
                            >
                              {t.type === 'BUY' ? '-' : '+'}
                              {Math.round(cost).toLocaleString('ko-KR')}
                            </div>
                            {(() => {
                              // 매수=현재가 손익, 매도=실현손익
                              const pl = isBuy ? evalDiff : realized?.pl ?? null;
                              const pct = isBuy ? evalPct : realized?.plPct ?? null;
                              if (pl == null) return null;
                              return (
                                <div
                                  className={`text-[11px] font-semibold mt-0.5 ${
                                    pl > 0
                                      ? 'text-rose-500'
                                      : pl < 0
                                        ? 'text-blue-500'
                                        : 'text-gray-400'
                                  }`}
                                >
                                  {pl > 0 ? '+' : ''}
                                  {Math.round(pl).toLocaleString('ko-KR')}
                                  {pct != null && (
                                    <span className="ml-1 text-[10px]">
                                      ({pct > 0 ? '+' : ''}
                                      {pct.toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                            {isBuy && !q && quotesLoading && (
                              <div className="text-[10px] text-gray-300 mt-0.5">시세…</div>
                            )}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* FAB — 캡쳐 등록 + 직접 입력 */}
      <div className="fixed bottom-24 right-1/2 translate-x-[calc(min(50vw,256px)-32px)] flex flex-col items-end gap-2 z-30">
        <button
          onClick={() => setImporting(true)}
          className="w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg active:bg-violet-700 flex items-center justify-center"
          title="캡쳐로 등록 (AI)"
        >
          <Camera size={20} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => setSheet({ mode: 'create' })}
          className="w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg active:bg-indigo-700 flex items-center justify-center"
          title="거래 추가"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      </div>

      {sheet && (
        <StockTransactionSheet
          mode={sheet.mode}
          tx={sheet.mode === 'edit' ? sheet.tx : undefined}
          onClose={() => setSheet(null)}
          onSaved={load}
        />
      )}

      {importing && (
        <StockImportFromImage
          onClose={() => setImporting(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
