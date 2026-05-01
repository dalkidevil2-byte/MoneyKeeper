'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import dayjs from 'dayjs';

type Trade = {
  id: string;
  date: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  owner_name: string;
};

type Realized = {
  owner_id: string;
  owner_name: string;
  total_pl: number;
  total_qty: number;
  trade_count: number;
};

interface Props {
  trades: Trade[];
  realized: Realized[];
  /** 보유 중일 때는 collapsed 기본값 true (간소 표시) */
  initialCollapsed?: boolean;
  currency?: string | null;
}

export default function TradeHistoryCompact({
  trades,
  realized,
  initialCollapsed = false,
  currency,
}: Props) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const fmt = (n: number) => {
    if (currency === 'USD')
      return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  };

  if (trades.length === 0) return null;

  const totalRealizedPL = realized.reduce((s, r) => s + r.total_pl, 0);
  const profit = totalRealizedPL >= 0;

  return (
    <div className="rounded-xl bg-white border border-gray-100">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between active:bg-gray-50"
      >
        <div className="flex items-center gap-2 text-[11px] min-w-0">
          <span className="font-bold text-gray-700 shrink-0">
            🧾 거래 {trades.length}건
          </span>
          {realized.length > 0 && (
            <span
              className={`font-semibold ${
                profit ? 'text-rose-500' : 'text-blue-500'
              } shrink-0`}
            >
              실현 {profit ? '+' : ''}
              {fmt(totalRealizedPL)}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronUp size={14} className="text-gray-400 shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          {/* 소유자별 실현 요약 */}
          {realized.length > 1 && (
            <div className="grid grid-cols-2 gap-1.5">
              {realized.map((r) => (
                <div
                  key={r.owner_id}
                  className="bg-gray-50 rounded-lg px-2 py-1.5"
                >
                  <div className="text-[10px] text-gray-500">{r.owner_name}</div>
                  <div
                    className={`text-xs font-semibold ${
                      r.total_pl >= 0 ? 'text-rose-500' : 'text-blue-500'
                    }`}
                  >
                    {r.total_pl >= 0 ? '+' : ''}
                    {fmt(r.total_pl)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 거래 리스트 */}
          <ul className="divide-y divide-gray-50 border-t border-gray-100">
            {trades.map((t) => (
              <li
                key={t.id}
                className="py-1.5 flex items-center justify-between text-[11px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      t.type === 'SELL'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-rose-50 text-rose-600'
                    }`}
                  >
                    {t.type === 'SELL' ? '매도' : '매수'}
                  </span>
                  <span className="text-gray-500">
                    {dayjs(t.date).format('YY.MM.DD')}
                  </span>
                  <span className="text-gray-400 truncate">{t.owner_name}</span>
                </div>
                <div className="text-gray-700 shrink-0 ml-2">
                  {t.quantity.toLocaleString('ko-KR')}주 ×{' '}
                  {fmt(t.price)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
