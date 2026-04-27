'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Wand2 } from 'lucide-react';
import dayjs from 'dayjs';

export type CashFlow = {
  id: string;
  account_id: string;
  date: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
  memo: string;
};

type Tx = {
  id: string;
  type: 'BUY' | 'SELL';
  date: string;
  quantity: number;
  price: number;
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
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 신규 입력 상태
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [type, setType] = useState<'DEPOSIT' | 'WITHDRAW'>('DEPOSIT');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  // 보정 모드
  const [adjustMode, setAdjustMode] = useState(false);
  const [actualBalance, setActualBalance] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, tRes] = await Promise.all([
        fetch(`${apiBase}/cash-flows?account_id=${accountId}`),
        fetch(`${apiBase}/transactions?account_id=${accountId}&limit=2000`),
      ]);
      if (!fRes.ok) throw new Error(`HTTP ${fRes.status}`);
      const fJson = await fRes.json();
      const tJson = tRes.ok ? await tRes.json() : { transactions: [] };
      setFlows(fJson.flows ?? []);
      setTxs(tJson.transactions ?? []);
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

  // 거래(매수/매도) 까지 반영한 "계산상 현금잔고"
  const computedCash = useMemo(() => {
    let bal = total;
    for (const t of txs) {
      bal += t.type === 'BUY' ? -t.quantity * t.price : t.quantity * t.price;
    }
    return bal;
  }, [total, txs]);

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

  // 현재 잔고를 입력하면 차이만큼 자동 보정 entry 생성
  const handleAdjust = useCallback(async () => {
    setError(null);
    const target = parseFloat(actualBalance);
    if (!isFinite(target)) {
      setError('현재 잔고를 숫자로 입력해주세요.');
      return;
    }
    const diff = Math.round(target - computedCash);
    if (diff === 0) {
      setError('이미 잔고가 일치합니다.');
      return;
    }
    setSaving(true);
    try {
      // 거래내역 시작일 이전 날짜로 보정 entry 생성 (없으면 오늘)
      const earliest =
        txs.length > 0
          ? txs.map((t) => t.date).sort()[0]
          : flows.length > 0
            ? flows.map((f) => f.date).sort()[0]
            : null;
      const adjDate = earliest
        ? dayjs(earliest).subtract(1, 'day').format('YYYY-MM-DD')
        : dayjs().format('YYYY-MM-DD');
      const res = await fetch(`${apiBase}/cash-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: accountId,
          date: adjDate,
          type: diff > 0 ? 'DEPOSIT' : 'WITHDRAW',
          amount: Math.abs(diff),
          memo: '잔고 보정 (초기 잔고 자동 산출)',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      setActualBalance('');
      setAdjustMode(false);
      await load();
      onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [actualBalance, computedCash, txs, flows, apiBase, accountId, load, onChanged]);

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
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs opacity-80">계산상 현금잔고</div>
                <div className="text-2xl font-bold mt-1">
                  {computedCash.toLocaleString('ko-KR')}원
                </div>
              </div>
              <button
                onClick={() => setAdjustMode((v) => !v)}
                className="text-[11px] bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 inline-flex items-center gap-1"
                title="현재 실제 잔고로 자동 보정"
              >
                <Wand2 size={11} /> 잔고 보정
              </button>
            </div>
            <div className="text-[11px] opacity-80 mt-2">
              시드머니 합 {total.toLocaleString('ko-KR')}원
              <span className="mx-1">·</span>
              거래 순영향{' '}
              {(computedCash - total).toLocaleString('ko-KR')}원
            </div>
          </div>

          {adjustMode && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-2xl p-3">
              <div className="text-[11px] text-amber-700 font-semibold">
                지금 증권사 앱의 실제 예수금을 입력하세요.
                <br />
                계산상 잔고와의 차이만큼 자동으로 보정 입금/출금이 추가됩니다.
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={actualBalance}
                  onChange={(e) => setActualBalance(e.target.value)}
                  placeholder="실제 현재 잔고"
                  className="flex-1 px-3 py-2 rounded-xl border border-amber-300 bg-white text-sm focus:border-amber-500 focus:outline-none"
                />
                <button
                  onClick={handleAdjust}
                  disabled={saving || !actualBalance}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  보정
                </button>
              </div>
              {actualBalance && isFinite(parseFloat(actualBalance)) && (
                <div className="text-[11px] text-amber-700 mt-1.5">
                  차이 {(parseFloat(actualBalance) - computedCash).toLocaleString('ko-KR')}원 →{' '}
                  {parseFloat(actualBalance) - computedCash > 0 ? '입금' : '출금'} 1건 자동 추가
                </div>
              )}
            </div>
          )}
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
