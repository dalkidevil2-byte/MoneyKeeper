'use client';

import { useState } from 'react';
import { Check, Cloud, X } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import type { Transaction } from '@/types';
import { TRANSACTION_TYPE_LABELS } from '@/types';

interface Props {
  transaction: Transaction;
  onClose: () => void;
}

export default function TransactionConfirmSheet({ transaction: tx, onClose }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const isExpense = ['variable_expense', 'fixed_expense'].includes(tx.type);
  const isIncome = tx.type === 'income';

  const handleSync = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/sync`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setSynced(true);
      } else {
        setSyncError(data.error ?? 'Notion 동기화 실패');
      }
    } catch {
      setSyncError('네트워크 오류');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
              <Check size={16} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">거래가 등록됐어요</p>
              <p className="text-xs text-gray-400">내용을 확인해주세요</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-400" />
          </button>
        </div>

        {/* 거래 요약 */}
        <div className="px-5 py-4 space-y-3">
          {/* 금액 */}
          <div className="text-center py-2">
            <p className={`text-3xl font-bold ${isIncome ? 'text-emerald-500' : isExpense ? 'text-rose-500' : 'text-blue-500'}`}>
              {isExpense ? '-' : isIncome ? '+' : ''}{formatAmount(tx.amount)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{TRANSACTION_TYPE_LABELS[tx.type]}</p>
          </div>

          {/* 상세 정보 */}
          <div className="bg-gray-50 rounded-2xl divide-y divide-gray-100">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-xs text-gray-400">내용</span>
              <span className="text-xs font-medium text-gray-800">{tx.name || tx.merchant_name || '-'}</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-xs text-gray-400">날짜</span>
              <span className="text-xs font-medium text-gray-800">{tx.date}</span>
            </div>
            {tx.category_main && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-gray-400">카테고리</span>
                <span className="text-xs font-medium text-gray-800">
                  {tx.category_main}{tx.category_sub ? ` · ${tx.category_sub}` : ''}
                </span>
              </div>
            )}
            {tx.payment_method && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-gray-400">결제수단</span>
                <span className="text-xs font-medium text-gray-800">{tx.payment_method.name}</span>
              </div>
            )}
            {tx.member && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-gray-400">결제자</span>
                <span className="text-xs font-medium" style={{ color: tx.member.color }}>{tx.member.name}</span>
              </div>
            )}
            {tx.memo && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-gray-400">메모</span>
                <span className="text-xs font-medium text-gray-800">{tx.memo}</span>
              </div>
            )}
          </div>

          {syncError && (
            <p className="text-xs text-rose-500 text-center bg-rose-50 rounded-xl py-2">{syncError}</p>
          )}

          <div className="flex gap-2 pt-1 pb-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-2xl text-sm font-medium"
            >
              닫기
            </button>
            {synced ? (
              <div className="flex-[2] py-3 bg-emerald-500 text-white rounded-2xl text-sm font-semibold flex items-center justify-center gap-2">
                <Cloud size={16} /> Notion 동기화 완료!
              </div>
            ) : (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-[2] py-3 bg-indigo-600 text-white rounded-2xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {syncing
                  ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 동기화 중...</>
                  : <><Cloud size={16} /> Notion에 동기화</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
