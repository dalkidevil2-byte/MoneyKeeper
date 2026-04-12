'use client';

import { useState } from 'react';
import { AlertTriangle, X, TrendingUp } from 'lucide-react';
import { formatAmount } from '@/lib/parser';

interface Alert {
  category: string;
  rate: number;
  amount: number;
  budget: number;
  emoji: string;
}

interface Props {
  alerts: Alert[];
}

export default function BudgetAlertBanner({ alerts }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = alerts.filter((a) => !dismissed.has(a.category));
  if (visible.length === 0) return null;

  const overBudget = visible.filter((a) => a.rate >= 100);
  const nearBudget  = visible.filter((a) => a.rate >= 80 && a.rate < 100);

  return (
    <div className="space-y-2">
      {/* 초과 알림 */}
      {overBudget.map((a) => (
        <div key={a.category} className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
          <span className="text-xl flex-shrink-0">{a.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-700">
              {a.category} 예산 초과!
            </p>
            <p className="text-xs text-rose-500 mt-0.5">
              {formatAmount(a.amount)} 사용 · 예산 {formatAmount(a.budget)} 대비 {a.rate}%
            </p>
          </div>
          <button onClick={() => setDismissed((s) => new Set([...s, a.category]))} className="text-rose-300 flex-shrink-0 mt-0.5">
            <X size={15} />
          </button>
        </div>
      ))}

      {/* 주의 알림 (80~99%) */}
      {nearBudget.map((a) => (
        <div key={a.category} className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <span className="text-xl flex-shrink-0">{a.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-700">
              {a.category} 예산 {a.rate}% 사용
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {formatAmount(a.budget - a.amount)} 남았어요
            </p>
          </div>
          <button onClick={() => setDismissed((s) => new Set([...s, a.category]))} className="text-amber-300 flex-shrink-0 mt-0.5">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
