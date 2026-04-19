'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

export type CashFlow = {
  id: string;
  account_id: string;
  date: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  memo: string;
};

interface Props {
  accountId: string;
  accountLabel: string;          // 표시용 (예: "김주희 · 토스증권")
  apiBase?: '/api/stocks' | '/api/stocks/paper';
  onClose: () => void;
  onChanged?: () => void;        // 외부에 변경 알림 (목록 갱신)
}

/**
 * 계좌별 입출금 내역 시트.
 * - 누적 시드머니 합계 (입금 - 출금) 상단 표시
 * - 신규 추가 인라인 폼
 * - 각 행 삭제 가능
 */
export default function CashFlowSheet({
  accountId,
  accountLabel,
  apiBase = '/api/stocks',
  onClose,
  onChanged,
}: Props) {
  const [flows, setFlows] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 신규 입력 상태
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/cash-flows?account_id=${accountId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFlows(json.flows ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [accountId, apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const total = useMemo(() => {
    return flows.reduce(
      (s, f) => s + (f.type === 'DEPOSIT' ? f.amount : -f.amount),
      0
    );
  }, [flows]);

  const handleAdd = useCallback(async () => {
    setError(null);
    const amt = parseFloat(amount);
    if (!isFinite(amt) || amt <= 0) {
      setError('금액을 올바르게 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/cash-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          date,
          type,
          amount: Math.round(amt),
          memo: memo.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setAmount('');
      setMemo('');
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [amount, accountId, date, type, memo, apiBase, load, onChanged]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('이 입출금 내역을 삭제할까요?')) return;
      try {
        const res = await fetch(`${apiBase}/cash-flows/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await load();
        onChanged?.();
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [apiBase, load, onChanged]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-start justify-between px-5 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-gray-900">시드머니</h3>
            <div className="text-[11px] text-gray-400 truncate">{accountLabel}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* 누적 카드 */}
        <div className="px-5 pb-3 flex-shrink-0">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-4">
            <div className="text-xs opacity-80">현재 시드머니 (입금 − 출금)</div>
            <div className="text-2xl font-bold mt-1">
              {total.toLocaleString('ko-KR')}원
            </div>
            <div className="text-[11px] opacity-80 mt-1">
              총 {flows.length}건
            </div>
          </div>
        </div>

        {/* 신규 입력 */}
        <div className="px-5 pb-3 flex-shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('DEPOSIT')}
              className={`py-2 rounded-xl text-xs font-semibold border ${
                type === 'DEPOSIT'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              입금
            </button>
            <button
              onClick={() => setType('WITHDRAW')}
              className={`py-2 rounded-xl text-xs font-semibold border ${
                type === 'WITHDRAW'
                  ? 'bg-amber-50 border-amber-300 text-amber-600'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              출금
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="금액"
              className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모 (선택)"
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
            >
              <Plus size={14} />
              추가
            </button>
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-3 py-2 text-xs">
              {error}
            </div>
          )}
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto flex-1 px-5 pb-6">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
          ) : flows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">입출금 내역이 없습니다</div>
          ) : (
            <ul className="bg-gray-50 rounded-2xl divide-y divide-gray-100 overflow-hidden">
              {flows.map((f) => (
                <li key={f.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          f.type === 'DEPOSIT'
                            ? 'bg-emerald-100 text-emerald-600'
                            : 'bg-amber-100 text-amber-600'
                        }`}
                      >
                        {f.type === 'DEPOSIT' ? '입금' : '출금'}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {dayjs(f.date).format('YYYY.MM.DD')}
                      </span>
                    </div>
                    {f.memo && (
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {f.memo}
                      </div>
                    )}
                  </div>
                  <div
                    className={`text-sm font-bold shrink-0 ${
                      f.type === 'DEPOSIT' ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {f.type === 'DEPOSIT' ? '+' : '-'}
                    {f.amount.toLocaleString('ko-KR')}
                  </div>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"
                    title="삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
