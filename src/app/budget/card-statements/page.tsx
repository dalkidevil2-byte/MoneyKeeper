'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, CreditCard, X, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { useAccounts, usePaymentMethods } from '@/hooks/useAccounts';
import dayjs from 'dayjs';
import type { CardStatement } from '@/types';

const numOnly = (v: string) => v.replace(/[^0-9]/g, '');
const fmt = (n: number) => Number(n ?? 0).toLocaleString('ko-KR');

export default function CardStatementsPage() {
  const { paymentMethods } = usePaymentMethods();
  const { accounts } = useAccounts();
  const [list, setList] = useState<CardStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const creditCards = paymentMethods.filter((p) => p.type === 'credit_card');
  const cashAccounts = accounts.filter(
    (a) => a.type === 'bank' || a.type === 'easy_pay_balance',
  );

  // 폼
  const today = dayjs();
  const [form, setForm] = useState({
    payment_method_id: '',
    billing_period_start: today.startOf('month').subtract(1, 'month').format('YYYY-MM-DD'),
    billing_period_end: today.endOf('month').subtract(1, 'month').format('YYYY-MM-DD'),
    payment_due_date: today.format('YYYY-MM-DD'),
    billed_amount: '',
    account_id: '',
    memo: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/card-statements');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setList(j.statements ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!form.payment_method_id || !form.billed_amount) {
      setErr('카드와 청구액을 입력해주세요');
      return;
    }
    setErr(null);
    try {
      const res = await fetch('/api/card-statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          billed_amount: parseInt(form.billed_amount, 10),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setAdding(false);
      setForm((f) => ({ ...f, billed_amount: '', memo: '' }));
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '실패');
    }
  };

  const pay = async (id: string, accountId: string | null | undefined) => {
    if (!accountId) {
      const acc = prompt('출금 계좌가 지정되지 않았어요. 계좌 ID를 입력하거나 청구서를 수정해주세요.');
      if (!acc) return;
      accountId = acc;
    }
    if (!confirm('이 청구서를 결제 완료 처리할까요?\n출금 계좌에서 거래가 생성됩니다.')) return;
    try {
      const res = await fetch(`/api/card-statements/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('청구서를 삭제할까요?')) return;
    await fetch(`/api/card-statements/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/budget" className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">카드 청구서</h1>
          <button
            onClick={() => setAdding(!adding)}
            className="text-sm text-indigo-600 font-medium inline-flex items-center gap-1"
          >
            <Plus size={16} /> 추가
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {adding && (
          <div className="bg-indigo-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-indigo-900">새 청구서</h2>
              <button onClick={() => setAdding(false)} className="text-indigo-400">
                <X size={16} />
              </button>
            </div>
            <select
              value={form.payment_method_id}
              onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}
              className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white"
            >
              <option value="">카드 선택</option>
              {creditCards.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">청구 시작</label>
                <input
                  type="date"
                  value={form.billing_period_start}
                  onChange={(e) => setForm((f) => ({ ...f, billing_period_start: e.target.value }))}
                  className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">청구 종료</label>
                <input
                  type="date"
                  value={form.billing_period_end}
                  onChange={(e) => setForm((f) => ({ ...f, billing_period_end: e.target.value }))}
                  className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm bg-white"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">결제일</label>
              <input
                type="date"
                value={form.payment_due_date}
                onChange={(e) => setForm((f) => ({ ...f, payment_due_date: e.target.value }))}
                className="w-full border border-indigo-200 rounded-xl px-3 py-2 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">청구액 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.billed_amount ? Number(form.billed_amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => setForm((f) => ({ ...f, billed_amount: numOnly(e.target.value) }))}
                placeholder="카드사가 청구한 실제 금액"
                className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white"
              />
            </div>
            <select
              value={form.account_id}
              onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))}
              className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white"
            >
              <option value="">출금 계좌 선택 (결제일에 빠져나갈 계좌)</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({fmt(a.balance ?? 0)}원)
                </option>
              ))}
            </select>
            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="메모 (선택)"
              className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white"
            />
            <button
              onClick={submit}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold"
            >
              청구서 등록
            </button>
            {err && <p className="text-xs text-rose-500">{err}</p>}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-400">
            불러오는 중…
          </div>
        ) : list.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-gray-400">
            등록된 청구서가 없어요
            <p className="text-xs mt-1">카드사에서 받은 청구서를 등록해보세요</p>
          </div>
        ) : (
          list.map((s) => {
            const billed = Number(s.billed_amount);
            const recorded = Number(s.recorded_amount ?? 0);
            const diff = billed - recorded;
            const overdue =
              s.status === 'pending' && dayjs(s.payment_due_date).isBefore(dayjs(), 'day');
            return (
              <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CreditCard size={16} className="text-indigo-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {s.payment_method?.name ?? '카드'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {dayjs(s.billing_period_start).format('M.D')} ~{' '}
                        {dayjs(s.billing_period_end).format('M.D')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {s.status === 'paid' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                        <CheckCircle2 size={11} /> 결제 완료
                      </span>
                    ) : overdue ? (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-rose-100 text-rose-700 px-2 py-1 rounded-full">
                        <AlertCircle size={11} /> 지연
                      </span>
                    ) : (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                        결제 예정 {dayjs(s.payment_due_date).format('M/D')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">앱 기록 사용액</span>
                    <span className="font-medium">{fmt(recorded)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">실제 청구액</span>
                    <span className="font-bold text-gray-900">{fmt(billed)}원</span>
                  </div>
                  <div className="border-t border-gray-200 my-1" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">차이</span>
                    <span
                      className={
                        diff === 0
                          ? 'font-bold text-emerald-600'
                          : diff > 0
                            ? 'font-bold text-rose-600'
                            : 'font-bold text-blue-600'
                      }
                    >
                      {diff === 0 ? '✓ 일치' : `${diff > 0 ? '+' : ''}${fmt(diff)}원`}
                    </span>
                  </div>
                  {diff > 0 && (
                    <p className="text-[11px] text-rose-500 mt-1">
                      앱에 누락된 사용 내역이 있을 수 있어요
                    </p>
                  )}
                </div>

                {s.account?.name && (
                  <p className="text-xs text-gray-400">
                    출금 예정: {s.account.name}
                  </p>
                )}

                <div className="flex gap-2">
                  {s.status !== 'paid' && (
                    <button
                      onClick={() => pay(s.id, s.account_id)}
                      className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium"
                    >
                      결제 완료 처리
                    </button>
                  )}
                  <button
                    onClick={() => remove(s.id)}
                    className="px-3 py-2 border border-gray-200 text-gray-400 rounded-xl"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
