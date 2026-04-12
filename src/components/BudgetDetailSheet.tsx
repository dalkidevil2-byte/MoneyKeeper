'use client';

import { X } from 'lucide-react';
import type { Transaction } from '@/types';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

interface Props {
  category: string;
  emoji: string;
  spent: number;
  budget: number;
  transactions: Transaction[];
  onClose: () => void;
  onEditTx: (tx: Transaction) => void;
}

export default function BudgetDetailSheet({ category, emoji, spent, budget, transactions, onClose, onEditTx }: Props) {
  const rate = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const remaining = budget - spent;

  const barColor =
    rate >= 100 ? 'bg-rose-500' :
    rate >= 90  ? 'bg-orange-400' :
    rate >= 80  ? 'bg-amber-400' :
    'bg-emerald-400';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <div>
              <p className="text-lg font-bold text-gray-900">{category}</p>
              <p className="text-xs text-gray-400">{transactions.length}건</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 예산 요약 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="bg-gray-50 rounded-2xl p-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-500">사용</span>
              <span className={`font-bold ${rate >= 100 ? 'text-rose-500' : rate >= 80 ? 'text-amber-500' : 'text-gray-800'}`}>
                {formatAmount(spent)} ({rate}%)
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
              <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(rate, 100)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-gray-400">
              <span>예산 {formatAmount(budget)}</span>
              <span className={remaining < 0 ? 'text-rose-500 font-medium' : ''}>
                {remaining >= 0 ? `남은 ${formatAmount(remaining)}` : `${formatAmount(Math.abs(remaining))} 초과`}
              </span>
            </div>
          </div>
        </div>

        {/* 거래 목록 */}
        <div className="overflow-y-auto flex-1 px-5 pb-6">
          {transactions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">이번 달 지출이 없어요</div>
          ) : (
            <div className="bg-white divide-y divide-gray-50 rounded-2xl border border-gray-100 overflow-hidden">
              {transactions
                .sort((a, b) => (a.date < b.date ? 1 : -1))
                .map((tx) => (
                  <button
                    key={tx.id}
                    onClick={() => { onClose(); setTimeout(() => onEditTx(tx), 150); }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{tx.merchant_name || tx.name || '-'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {dayjs(tx.date).format('M월 D일 (ddd)')}
                        {tx.category_sub && ` · ${tx.category_sub}`}
                        {(tx as any).member?.name && ` · ${(tx as any).member.name}`}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-rose-500 flex-shrink-0 ml-2">
                      -{formatAmount(tx.amount)}
                    </p>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
