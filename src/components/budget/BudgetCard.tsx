'use client';

import { AlertTriangle, TrendingUp } from 'lucide-react';
import { formatAmount } from '@/lib/parser';

interface BudgetCardProps {
  budget: {
    id: string;
    name: string;
    amount: number;
    used_amount: number;
    usage_rate: number;
    warning_level: string;
    projected_overage: boolean;
  };
}

export default function BudgetCard({ budget }: BudgetCardProps) {
  const { amount, used_amount, usage_rate, warning_level, projected_overage } = budget;
  const remaining = amount - used_amount;

  const barColor =
    warning_level === 'warning_100' ? 'bg-rose-500' :
    warning_level === 'warning_90' ? 'bg-orange-400' :
    warning_level === 'warning_80' ? 'bg-amber-400' :
    'bg-indigo-500';

  const bgColor =
    warning_level === 'warning_100' ? 'bg-rose-50 border-rose-100' :
    warning_level === 'warning_90' ? 'bg-orange-50 border-orange-100' :
    warning_level === 'warning_80' ? 'bg-amber-50 border-amber-100' :
    'bg-white border-gray-100';

  return (
    <div className={`rounded-2xl border p-4 ${bgColor}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-gray-700">{budget.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">이번 달 예산</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{usage_rate}%</p>
          {warning_level !== 'none' && (
            <div className="flex items-center gap-1 justify-end mt-0.5">
              <AlertTriangle size={12} className={
                warning_level === 'warning_100' ? 'text-rose-500' :
                warning_level === 'warning_90' ? 'text-orange-500' :
                'text-amber-500'
              } />
              <span className={`text-xs font-medium ${
                warning_level === 'warning_100' ? 'text-rose-500' :
                warning_level === 'warning_90' ? 'text-orange-500' :
                'text-amber-500'
              }`}>
                {warning_level === 'warning_100' ? '예산 초과!' :
                 warning_level === 'warning_90' ? '90% 도달' :
                 '80% 도달'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(usage_rate, 100)}%` }}
        />
      </div>

      {/* 금액 상세 */}
      <div className="flex justify-between text-sm">
        <div>
          <p className="text-gray-500 text-xs">사용</p>
          <p className="font-semibold text-gray-800">{formatAmount(used_amount)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 text-xs">남은</p>
          <p className={`font-semibold ${remaining < 0 ? 'text-rose-500' : 'text-gray-800'}`}>
            {remaining >= 0 ? formatAmount(remaining) : `-${formatAmount(Math.abs(remaining))}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-gray-500 text-xs">총 예산</p>
          <p className="font-semibold text-gray-800">{formatAmount(amount)}</p>
        </div>
      </div>

      {/* 소비 속도 경고 */}
      {projected_overage && warning_level === 'none' && (
        <div className="mt-3 flex items-center gap-1.5 text-amber-600 bg-amber-50 rounded-xl px-3 py-2">
          <TrendingUp size={14} />
          <p className="text-xs font-medium">현재 소비 속도라면 이번 달 예산을 초과할 수 있어요</p>
        </div>
      )}
    </div>
  );
}
