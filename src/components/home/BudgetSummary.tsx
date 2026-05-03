'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

type Tx = { type: string; amount: number };
type Budget = { is_total: boolean; amount: number };

export default function BudgetSummary() {
  const [spent, setSpent] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);

  useEffect(() => {
    const today = dayjs();
    const start = today.startOf('month').format('YYYY-MM-DD');
    const end = today.endOf('month').format('YYYY-MM-DD');

    let cancelled = false;

    (async () => {
      try {
        const [txRes, bRes] = await Promise.all([
          fetch(`/api/transactions?start_date=${start}&end_date=${end}&limit=500`),
          fetch('/api/budgets'),
        ]);
        const txJson = await txRes.json();
        const bJson = await bRes.json();

        const txs: Tx[] = txJson.transactions ?? [];
        // 메인 요약은 '변동 지출' 만 — 고정 지출은 예산 비교 의미가 적음
        const total = txs
          .filter((t) => t.type === 'variable_expense')
          .reduce((s, t) => s + t.amount, 0);

        const budgets: Budget[] = bJson.budgets ?? [];
        const totalBudget = budgets.find((b) => b.is_total)?.amount ?? 0;

        if (!cancelled) {
          setSpent(total);
          setBudget(totalBudget);
        }
      } catch {
        if (!cancelled) {
          setSpent(0);
          setBudget(0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const loading = spent === null || budget === null;
  const rate = budget && budget > 0 ? Math.round(((spent ?? 0) / budget) * 100) : 0;
  const remaining = (budget ?? 0) - (spent ?? 0);

  const barColor =
    rate >= 100 ? 'bg-rose-400' : rate >= 90 ? 'bg-orange-400' : rate >= 80 ? 'bg-amber-400' : 'bg-emerald-400';

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {loading ? (
        <div className="text-xs text-gray-400">불러오는 중…</div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500">이번 달 변동 지출</span>
            <span className="text-sm font-bold text-gray-900">
              {(spent ?? 0).toLocaleString('ko-KR')}원
            </span>
          </div>
          {budget && budget > 0 ? (
            <>
              <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor}`}
                  style={{ width: `${Math.min(rate, 100)}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[11px] text-gray-400">
                <span>예산 {budget.toLocaleString('ko-KR')}원 · {rate}%</span>
                <span className={remaining < 0 ? 'text-rose-500 font-medium' : ''}>
                  {remaining >= 0
                    ? `남은 ${remaining.toLocaleString('ko-KR')}원`
                    : `${Math.abs(remaining).toLocaleString('ko-KR')}원 초과`}
                </span>
              </div>
            </>
          ) : (
            <div className="text-[11px] text-gray-400 mt-1">예산 미설정</div>
          )}
        </>
      )}
    </div>
  );
}
