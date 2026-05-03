'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wrench, X } from 'lucide-react';
import type { Account } from '@/types';

type Kind = 'deposit' | 'withdraw' | 'transfer' | 'adjust';

const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

export default function AccountActions({
  account,
  accounts,
  onDone,
}: {
  account: Account;
  accounts: Account[];
  onDone?: () => void;
}) {
  const [open, setOpen] = useState<Kind | null>(null);
  const [amount, setAmount] = useState('');
  const [actualBalance, setActualBalance] = useState('');
  const [memo, setMemo] = useState('');
  const [toId, setToId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPoints = account.type === 'points';
  const unit = isPoints ? 'P' : '원';

  const close = () => {
    setOpen(null);
    setAmount('');
    setActualBalance('');
    setMemo('');
    setToId('');
    setErr(null);
  };

  const submitMovement = async () => {
    if (!open || open === 'adjust') return;
    const n = parseInt(amount || '0', 10);
    if (n <= 0) {
      setErr('금액을 입력하세요');
      return;
    }
    if (open === 'transfer' && !toId) {
      setErr('이체할 계좌를 선택하세요');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/movement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: open,
          amount: n,
          memo,
          account_to_id: open === 'transfer' ? toId : undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      close();
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const submitAdjust = async () => {
    const target = parseInt(actualBalance || '0', 10);
    if (!Number.isFinite(target)) {
      setErr('실제 잔액을 입력하세요');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/accounts/${account.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actual_balance: target,
          note: memo || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      close();
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const otherAccounts = accounts.filter((a) => a.id !== account.id);

  return (
    <>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        <button
          onClick={() => setOpen('deposit')}
          className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg active:bg-emerald-100"
        >
          <ArrowDownLeft size={11} />
          {isPoints ? '적립' : '입금'}
        </button>
        <button
          onClick={() => setOpen('withdraw')}
          className="inline-flex items-center gap-1 text-[11px] bg-rose-50 text-rose-700 px-2 py-1 rounded-lg active:bg-rose-100"
        >
          <ArrowUpRight size={11} />
          {isPoints ? '사용' : '출금'}
        </button>
        {!isPoints && otherAccounts.length > 0 && (
          <button
            onClick={() => setOpen('transfer')}
            className="inline-flex items-center gap-1 text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded-lg active:bg-blue-100"
          >
            <ArrowLeftRight size={11} />
            이체
          </button>
        )}
        <button
          onClick={() => {
            setOpen('adjust');
            setActualBalance(String(account.balance ?? 0));
          }}
          className="inline-flex items-center gap-1 text-[11px] bg-violet-50 text-violet-700 px-2 py-1 rounded-lg active:bg-violet-100"
        >
          <Wrench size={11} />
          잔액 맞추기
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
          onClick={close}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900">
                {open === 'deposit' && (isPoints ? '포인트 적립' : '입금')}
                {open === 'withdraw' && (isPoints ? '포인트 사용' : '출금')}
                {open === 'transfer' && '계좌 이체'}
                {open === 'adjust' && '잔액 맞추기'}
              </h3>
              <button onClick={close} className="p-1 rounded-lg hover:bg-gray-100">
                <X size={18} className="text-gray-400" />
              </button>
            </div>

            <div className="text-xs text-gray-500">
              {account.name} ({Number(account.balance ?? 0).toLocaleString('ko-KR')}
              {unit})
            </div>

            {open === 'adjust' ? (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">
                    실제 잔액 ({unit})
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={actualBalance ? Number(actualBalance).toLocaleString('ko-KR') : ''}
                    onChange={(e) => setActualBalance(numOnly(e.target.value))}
                    placeholder="통장에 찍힌 실제 잔액"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                    autoFocus
                  />
                </div>
                {actualBalance && (
                  <p className="text-xs text-violet-600 px-1">
                    차이:{' '}
                    {(
                      parseInt(actualBalance, 10) - Number(account.balance ?? 0)
                    ).toLocaleString('ko-KR')}
                    {unit}
                  </p>
                )}
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모 (선택, 예: 11월 잔액 정산)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                />
                <button
                  onClick={submitAdjust}
                  disabled={busy || !actualBalance}
                  className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-bold disabled:opacity-40"
                >
                  {busy ? '처리 중…' : '잔액 보정'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">금액 ({unit})</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amount ? Number(amount).toLocaleString('ko-KR') : ''}
                    onChange={(e) => setAmount(numOnly(e.target.value))}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    autoFocus
                  />
                </div>
                {open === 'transfer' && (
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">받는 계좌</label>
                    <select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                    >
                      <option value="">선택</option>
                      {otherAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({Number(a.balance ?? 0).toLocaleString('ko-KR')}원)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="메모 (선택)"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                />
                <button
                  onClick={submitMovement}
                  disabled={busy || !amount}
                  className={`w-full py-3 text-white rounded-xl text-sm font-bold disabled:opacity-40 ${
                    open === 'deposit'
                      ? 'bg-emerald-600'
                      : open === 'withdraw'
                        ? 'bg-rose-600'
                        : 'bg-blue-600'
                  }`}
                >
                  {busy
                    ? '처리 중…'
                    : open === 'deposit'
                      ? isPoints
                        ? '적립하기'
                        : '입금하기'
                      : open === 'withdraw'
                        ? isPoints
                          ? '사용 기록'
                          : '출금하기'
                        : '이체하기'}
                </button>
              </>
            )}

            {err && <p className="text-xs text-rose-500">{err}</p>}
          </div>
        </div>
      )}
    </>
  );
}
