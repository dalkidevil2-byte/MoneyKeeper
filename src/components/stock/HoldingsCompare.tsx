'use client';

type OwnerHolding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
};

interface Props {
  holdings: OwnerHolding[];
  currentPrice: number | null;
  currency?: string | null;
}

export default function HoldingsCompare({ holdings, currentPrice, currency }: Props) {
  if (holdings.length === 0) {
    return (
      <div className="px-3 py-2 rounded-lg bg-gray-50 text-[11px] text-gray-400">
        이 종목 보유 없음
      </div>
    );
  }

  const fmt = (n: number) => {
    if (currency === 'USD') return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  };

  // 전체 합산
  const totalQty = holdings.reduce((s, h) => s + h.qty, 0);
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalValue = currentPrice != null ? totalQty * currentPrice : null;
  const totalPL = totalValue != null ? totalValue - totalInvested : null;
  const totalPLPct =
    totalPL != null && totalInvested > 0 ? (totalPL / totalInvested) * 100 : null;

  return (
    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-3 space-y-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-bold text-emerald-800">📊 보유 현황</span>
        {currentPrice != null && (
          <span className="text-emerald-700">현재가 {fmt(currentPrice)}</span>
        )}
      </div>

      <div className="space-y-1.5">
        {holdings.map((h) => {
          const value = currentPrice != null ? h.qty * currentPrice : null;
          const pl = value != null ? value - h.invested : null;
          const plPct = pl != null && h.invested > 0 ? (pl / h.invested) * 100 : null;
          const profit = pl != null && pl >= 0;
          return (
            <div
              key={h.owner_id}
              className="flex items-center justify-between bg-white/70 rounded-lg px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-gray-800 truncate">
                  {h.owner_name}
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  {h.qty.toLocaleString('ko-KR')}주 · 평단{' '}
                  {fmt(h.avgPrice)}
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                {value != null && (
                  <div className="text-xs font-semibold text-gray-800">
                    {fmt(value)}
                  </div>
                )}
                {pl != null && (
                  <div
                    className={`text-[10px] font-semibold ${
                      profit ? 'text-rose-500' : 'text-blue-500'
                    }`}
                  >
                    {profit ? '+' : ''}
                    {fmt(pl)}
                    {plPct != null && (
                      <> ({profit ? '+' : ''}{plPct.toFixed(2)}%)</>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 합계 (2명 이상일 때) */}
      {holdings.length > 1 && totalValue != null && (
        <div className="flex items-center justify-between border-t border-emerald-200 pt-1.5 px-1">
          <span className="text-[11px] font-bold text-emerald-800">합계</span>
          <div className="text-right">
            <div className="text-xs font-bold text-gray-900">
              {totalQty.toLocaleString('ko-KR')}주 · {fmt(totalValue)}
            </div>
            {totalPL != null && (
              <div
                className={`text-[10px] font-semibold ${
                  totalPL >= 0 ? 'text-rose-500' : 'text-blue-500'
                }`}
              >
                {totalPL >= 0 ? '+' : ''}
                {fmt(totalPL)}
                {totalPLPct != null && (
                  <> ({totalPL >= 0 ? '+' : ''}{totalPLPct.toFixed(2)}%)</>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
