'use client';

import { TrendingUp, TrendingDown, Wallet, Package } from 'lucide-react';

type OwnerHolding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
};

type Realized = {
  owner_id: string;
  owner_name: string;
  total_pl: number;
};

type Memo = {
  ticker: string;
  name?: string | null;
  current_price?: number | null;
  currency?: string | null;
  holdings?: OwnerHolding[];
  realized?: Realized[];
  has_history?: boolean;
};

interface Props {
  memos: Memo[];
  /** 표시되는(필터링된) 결과 기준 통계 */
}

const fmt = (n: number, currency?: string | null) => {
  if (currency === 'USD')
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
};
const sign = (n: number) => (n >= 0 ? '+' : '');

export default function MemoAnalyticsPanel({ memos }: Props) {
  // 종목 카운트
  const total = memos.length;
  const heldCount = memos.filter((m) => (m.holdings?.length ?? 0) > 0).length;
  const tradedCount = memos.filter(
    (m) => (m.holdings?.length ?? 0) === 0 && m.has_history,
  ).length;
  const memoOnlyCount = total - heldCount - tradedCount;

  // 누적 합계 (KRW 기준 단순 합산 — USD 종목 거의 없을 거라 가정)
  let totalInvested = 0;
  let totalCurrentValue = 0;
  let totalUnrealized = 0;
  let totalRealized = 0;

  for (const m of memos) {
    const hs = m.holdings ?? [];
    const realized = m.realized ?? [];
    const cp = m.current_price ?? null;

    for (const h of hs) {
      totalInvested += h.invested;
      const value = cp != null ? h.qty * cp : h.invested; // 시세 없을때는 invested 로 fallback
      totalCurrentValue += value;
      if (cp != null) totalUnrealized += value - h.invested;
    }
    for (const r of realized) {
      totalRealized += r.total_pl;
    }
  }

  const totalPL = totalUnrealized + totalRealized;
  const totalPLPct =
    totalInvested > 0 ? (totalPL / totalInvested) * 100 : null;

  const Stat = ({
    icon,
    label,
    value,
    sub,
    color,
  }: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    color?: string;
  }) => (
    <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
      <div className="flex items-center gap-1 text-[10px] text-gray-500 mb-0.5">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm font-bold ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );

  if (total === 0) return null;

  return (
    <div className="bg-gradient-to-br from-violet-50 via-indigo-50 to-blue-50 rounded-2xl p-3 border border-violet-100 space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-sm font-bold text-violet-900">📊 추천 종목 분석</h3>
        <span className="text-[10px] text-violet-700">
          {total}종 · 보유 {heldCount} · 매도완료 {tradedCount} · 메모만{' '}
          {memoOnlyCount}
        </span>
      </div>

      {/* 종합 손익 */}
      <div className="bg-white rounded-xl px-3 py-2.5 border border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
            {totalPL >= 0 ? (
              <TrendingUp size={11} className="text-rose-500" />
            ) : (
              <TrendingDown size={11} className="text-blue-500" />
            )}
            누적 손익
          </span>
          <span
            className={`text-base font-bold ${
              totalPL >= 0 ? 'text-rose-500' : 'text-blue-500'
            }`}
          >
            {sign(totalPL)}
            {fmt(totalPL)}
            {totalPLPct != null && (
              <span className="ml-1 text-xs">
                ({sign(totalPLPct)}
                {totalPLPct.toFixed(2)}%)
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px] text-gray-500">
          <span>
            미실현{' '}
            <span
              className={
                totalUnrealized >= 0 ? 'text-rose-500' : 'text-blue-500'
              }
            >
              {sign(totalUnrealized)}
              {fmt(totalUnrealized)}
            </span>
          </span>
          <span>
            실현{' '}
            <span
              className={totalRealized >= 0 ? 'text-rose-500' : 'text-blue-500'}
            >
              {sign(totalRealized)}
              {fmt(totalRealized)}
            </span>
          </span>
        </div>
      </div>

      {/* 통계 그리드 */}
      <div className="grid grid-cols-2 gap-2">
        <Stat
          icon={<Wallet size={11} />}
          label="총 투자"
          value={fmt(totalInvested)}
          sub={`${heldCount}종 보유`}
        />
        <Stat
          icon={<Package size={11} />}
          label="평가 금액"
          value={fmt(totalCurrentValue)}
          sub={
            totalInvested > 0
              ? `${((totalCurrentValue / totalInvested) * 100).toFixed(0)}%`
              : undefined
          }
        />
      </div>
    </div>
  );
}
