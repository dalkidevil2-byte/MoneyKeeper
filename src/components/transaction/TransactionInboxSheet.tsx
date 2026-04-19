'use client';

import { useState, useEffect } from 'react';
import { X, Cloud, CheckCircle2, ChevronRight, Inbox, Trash2 } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import { TRANSACTION_TYPE_LABELS } from '@/types';
import type { Transaction } from '@/types';
import TransactionEditModal from './TransactionEditModal';

interface Props {
  onClose: () => void;
  onUpdated: () => void;
}

export default function TransactionInboxSheet({ onClose, onUpdated }: Props) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = () =>
    fetch('/api/transactions/inbox')
      .then((r) => r.json())
      .then((d) => setItems(d.transactions ?? []));

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  // 저장 후 자동 확인 처리
  const handleSaved = async (tx: Transaction) => {
    if (tx.status === 'reviewed') {
      await fetch(`/api/transactions/${tx.id}/confirm`, { method: 'POST' });
    }
    await reload();
    setEditingTx(null);
    onUpdated();
  };

  const handleDelete = async (tx: Transaction) => {
    setDeletingId(tx.id);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((t) => t.id !== tx.id));
        onUpdated();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSync = async (tx: Transaction) => {
    setSyncingId(tx.id);
    try {
      const res = await fetch(`/api/transactions/${tx.id}/sync`, { method: 'POST' });
      if (res.ok) {
        setItems((prev) => prev.map((t) => t.id === tx.id ? { ...t, sync_status: 'synced' } : t));
        onUpdated();
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    const confirmed = items.filter((t) => t.sync_status === 'pending');
    for (const tx of confirmed) await handleSync(tx);
  };

  const needsReviewCount = items.filter((t) => t.status === 'reviewed').length;
  const pendingCount = items.filter((t) => t.status === 'confirmed' && t.sync_status === 'pending').length;

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
              <p className="text-sm font-bold text-gray-900">거래 확인함</p>
              <p className="text-xs text-gray-400">
                {needsReviewCount > 0 ? `${needsReviewCount}건 확인 필요` : pendingCount > 0 ? `${pendingCount}건 Notion 대기` : '모두 처리됨'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 1 && (
              <button onClick={handleSyncAll} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-xl font-medium">
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
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Inbox size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">확인할 거래가 없어요</p>
            </div>
          ) : (
            items.map((tx) => {
              const isExpense = ['variable_expense', 'fixed_expense'].includes(tx.type);
              const isIncome = tx.type === 'income';
              const needsReview = tx.status === 'reviewed';
              const synced = tx.sync_status === 'synced';

              return (
                <div key={tx.id} className={`rounded-2xl border overflow-hidden ${
                  synced ? 'border-emerald-200 bg-emerald-50'
                  : needsReview ? 'border-amber-200 bg-amber-50/30'
                  : 'border-indigo-100 bg-indigo-50/20'
                }`}>
                  {/* 항목 탭 → 편집 모달 */}
                  <button
                    type="button"
                    onClick={() => setEditingTx(tx)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    {/* 상태 아이콘 */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      synced ? 'bg-emerald-400' : needsReview ? 'bg-amber-400' : 'bg-indigo-400'
                    }`} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{tx.name || tx.merchant_name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {tx.date} · {TRANSACTION_TYPE_LABELS[tx.type]}
                        {needsReview && <span className="ml-1.5 text-amber-500 font-medium">· 확인 필요</span>}
                        {!needsReview && !synced && <span className="ml-1.5 text-indigo-500 font-medium">· 확인됨</span>}
                        {synced && <span className="ml-1.5 text-emerald-500 font-medium">· 동기화 완료</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-sm font-bold ${isIncome ? 'text-emerald-500' : isExpense ? 'text-rose-500' : 'text-blue-500'}`}>
                        {isExpense ? '-' : isIncome ? '+' : ''}{formatAmount(tx.amount)}
                      </span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </button>

                  {/* 확인된 항목: 동기화 / 삭제 버튼 */}
                  {!needsReview && (
                    <div className="flex gap-2 px-4 pb-3">
                      <button
                        onClick={() => handleDelete(tx)}
                        disabled={deletingId === tx.id}
                        className="flex-1 py-1.5 border border-rose-200 text-rose-500 text-xs font-medium rounded-xl disabled:opacity-40 flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} /> 삭제
                      </button>
                      {!synced && (
                        <button
                          onClick={() => handleSync(tx)}
                          disabled={syncingId === tx.id}
                          className="flex-1 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-xl disabled:opacity-40 flex items-center justify-center gap-1"
                        >
                          {syncingId === tx.id
                            ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <><Cloud size={12} /> Notion 동기화</>
                          }
                        </button>
                      )}
                      {synced && (
                        <div className="flex-1 py-1.5 flex items-center justify-center gap-1 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 size={12} /> 동기화 완료
                        </div>
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

      {editingTx && (
        <TransactionEditModal
          transaction={editingTx}
          onClose={() => setEditingTx(null)}
          onSaved={() => handleSaved(editingTx)}
          onDeleted={() => {
            setItems((prev) => prev.filter((t) => t.id !== editingTx.id));
            setEditingTx(null);
            onUpdated();
          }}
        />
      )}
    </div>
  );
}
