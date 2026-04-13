'use client';

import { useState, useEffect } from 'react';
import { X, Cloud, Check, ChevronDown, Inbox } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import { TRANSACTION_TYPE_LABELS } from '@/types';
import type { Transaction } from '@/types';

interface Props {
  onClose: () => void;
  onUpdated: () => void;
}

export default function TransactionInboxSheet({ onClose, onUpdated }: Props) {
  const [pending, setPending] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/transactions/inbox')
      .then((r) => r.json())
      .then((d) => { setPending(d.transactions ?? []); setLoading(false); });
  }, []);

  const handleSync = async (tx: Transaction) => {
    setSyncingId(tx.id);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/sync`, { method: 'POST' });
      if (res.ok) {
        setSyncedIds((s) => new Set([...s, tx.id]));
        onUpdated();
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    for (const tx of pending.filter((t) => !syncedIds.has(t.id))) {
      await handleSync(tx);
    }
  };

  const remaining = pending.filter((t) => !syncedIds.has(t.id));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Inbox size={18} className="text-indigo-500" />
            <div>
              <p className="text-sm font-bold text-gray-900">미확인 거래함</p>
              <p className="text-xs text-gray-400">{remaining.length}건 Notion 동기화 대기 중</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {remaining.length > 1 && (
              <button
                onClick={handleSyncAll}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-medium"
              >
                전체 동기화
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
              <X size={18} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : pending.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Inbox size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">미확인 거래가 없어요</p>
            </div>
          ) : (
            pending.map((tx) => {
              const isExpense = ['variable_expense', 'fixed_expense'].includes(tx.type);
              const isIncome = tx.type === 'income';
              const synced = syncedIds.has(tx.id);

              return (
                <div key={tx.id} className={`rounded-2xl overflow-hidden border ${synced ? 'border-emerald-200 bg-emerald-50' : 'border-gray-100 bg-white'}`}>
                  {/* 요약 행 */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                    className="w-full flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 text-left truncate">{tx.name || tx.merchant_name}</p>
                        <p className="text-xs text-gray-400 text-left">{tx.date} · {TRANSACTION_TYPE_LABELS[tx.type]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-sm font-bold ${isIncome ? 'text-emerald-500' : isExpense ? 'text-rose-500' : 'text-blue-500'}`}>
                        {isExpense ? '-' : isIncome ? '+' : ''}{formatAmount(tx.amount)}
                      </span>
                      <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedId === tx.id ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* 상세 + 동기화 버튼 */}
                  {expandedId === tx.id && (
                    <div className="px-4 pb-3 border-t border-gray-100 pt-2 space-y-2">
                      <div className="text-xs text-gray-500 space-y-1">
                        {tx.category_main && <p>카테고리: {tx.category_main}{tx.category_sub ? ` · ${tx.category_sub}` : ''}</p>}
                        {tx.payment_method && <p>결제수단: {tx.payment_method.name}</p>}
                        {tx.member && <p>결제자: {tx.member.name}</p>}
                        {tx.memo && <p>메모: {tx.memo}</p>}
                      </div>
                      {synced ? (
                        <div className="flex items-center gap-2 text-emerald-600 text-xs font-medium py-1">
                          <Check size={14} /> Notion 동기화 완료
                        </div>
                      ) : (
                        <button
                          onClick={() => handleSync(tx)}
                          disabled={syncingId === tx.id}
                          className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {syncingId === tx.id
                            ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> 동기화 중...</>
                            : <><Cloud size={14} /> Notion에 동기화</>
                          }
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 pb-6 pt-2 flex-shrink-0">
          <button onClick={onClose} className="w-full py-3 border border-gray-200 text-gray-600 rounded-2xl text-sm font-medium">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
