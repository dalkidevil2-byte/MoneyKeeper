'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, RepeatIcon, X, Check } from 'lucide-react';
import {
  useAccounts,
  usePaymentMethods,
  useCustomCategories,
  useFixedExpenseTemplates,
} from '@/hooks/useAccounts';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import { formatAmount } from '@/lib/parser';

type FTType = 'fixed_expense' | 'transfer' | 'income';

type FTForm = {
  name: string;
  amount: string;
  due_day: string;
  type: FTType;
  category_main: string;
  category_sub: string;
  payment_method_id: string;
  account_from_id: string;
  account_to_id: string;
  is_variable: boolean;
};

const emptyForm: FTForm = {
  name: '',
  amount: '',
  due_day: '1',
  type: 'fixed_expense',
  category_main: '',
  category_sub: '',
  payment_method_id: '',
  account_from_id: '',
  account_to_id: '',
  is_variable: false,
};

const numOnly = (v: string) => v.replace(/[^0-9]/g, '');
const withComma = (v: string) => (v ? Number(v).toLocaleString('ko-KR') : '');

export default function FixedExpensesPage() {
  const { accounts } = useAccounts();
  const { paymentMethods } = usePaymentMethods();
  const { categories: customCategories } = useCustomCategories();
  const {
    templates: fixedTemplates,
    loading: ftLoading,
    refetch: refetchFT,
  } = useFixedExpenseTemplates();

  // 폼 모드: null=목록만, 'add'=새로 추가, {id}=수정
  const [formMode, setFormMode] = useState<null | 'add' | { id: string }>(null);
  const [form, setForm] = useState<FTForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const customMainOnly = customCategories.filter((c) => !c.category_sub);
  const allCategoryOptions = [
    ...CATEGORY_MAIN_OPTIONS.filter((c) => c !== '수입'),
    ...customMainOnly
      .map((c) => c.category_main)
      .filter((m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m)),
  ];

  const startAdd = () => {
    setForm(emptyForm);
    setFormMode('add');
  };

  const startEdit = (ft: (typeof fixedTemplates)[number]) => {
    setForm({
      name: ft.name,
      amount: String(ft.amount),
      due_day: String(ft.due_day),
      type: (ft.type as FTType) ?? 'fixed_expense',
      category_main: ft.category_main ?? '',
      category_sub: ft.category_sub ?? '',
      payment_method_id: ft.payment_method_id ?? '',
      account_from_id: ft.account_from_id ?? '',
      account_to_id: ft.account_to_id ?? '',
      is_variable: ft.is_variable ?? false,
    });
    setFormMode({ id: ft.id });
  };

  const cancelForm = () => {
    setFormMode(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        amount: parseInt(form.amount),
        due_day: parseInt(form.due_day),
        type: form.type,
        category_main: form.category_main,
        category_sub: form.category_sub,
        payment_method_id: form.payment_method_id || null,
        account_from_id: form.account_from_id || null,
        account_to_id: form.account_to_id || null,
        is_variable: form.is_variable,
      };
      if (formMode === 'add') {
        await fetch('/api/fixed-expense-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else if (formMode && 'id' in formMode) {
        await fetch(`/api/fixed-expense-templates?id=${formMode.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      await refetchFT();
      cancelForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 고정지출 항목을 삭제할까요?')) return;
    await fetch(`/api/fixed-expense-templates?id=${id}`, { method: 'DELETE' });
    refetchFT();
  };

  const totalAmount = fixedTemplates.reduce((s, t) => {
    if (t.type === 'income') return s;
    return s + (t.amount || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/settings" className="p-2 rounded-xl hover:bg-gray-100">
            <ArrowLeft size={20} className="text-gray-600" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">고정지출 관리</h1>
          {!formMode && (
            <button
              onClick={startAdd}
              className="flex items-center gap-1 text-sm text-indigo-600 font-semibold"
            >
              <Plus size={16} /> 추가
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* 요약 */}
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-2xl p-4">
          <div className="text-xs opacity-80">월 고정지출 합계 (수입 제외)</div>
          <div className="text-2xl font-bold mt-1">{formatAmount(totalAmount)}</div>
          <div className="text-[11px] opacity-80 mt-1">
            총 {fixedTemplates.length}건
          </div>
        </div>

        {/* 폼 */}
        {formMode && (
          <div className="bg-indigo-50 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-indigo-700">
                {formMode === 'add' ? '새 항목 추가' : '항목 수정'}
              </span>
              <button onClick={cancelForm} className="p-1 rounded text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            {/* 유형 */}
            <div className="flex rounded-xl overflow-hidden border border-indigo-200 bg-white">
              {(['fixed_expense', 'transfer', 'income'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    form.type === t ? 'bg-indigo-600 text-white' : 'text-gray-500'
                  }`}
                >
                  {t === 'fixed_expense' ? '💸 고정지출' : t === 'transfer' ? '🔄 원금상환' : '💰 이자수입'}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={
                form.type === 'transfer'
                  ? '항목명 (예: 홍길동 원금상환)'
                  : form.type === 'income'
                    ? '항목명 (예: 홍길동 이자수입)'
                    : '항목명 (예: 월세, 보험료)'
              }
              autoFocus
              className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: numOnly(e.target.value) }))}
                placeholder="금액"
                className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="flex items-center gap-2 border border-indigo-200 rounded-xl px-3 py-2.5 bg-white">
                <span className="text-sm text-gray-500">매월</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
                  className="w-10 text-sm font-bold text-indigo-600 outline-none text-center"
                />
                <span className="text-sm text-gray-500">일</span>
              </div>
            </div>
            {form.amount && (
              <p className="text-xs text-indigo-600 px-1">= {withComma(form.amount)}원</p>
            )}

            {form.type === 'fixed_expense' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={form.category_main}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category_main: e.target.value, category_sub: '' }))
                    }
                    className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                  >
                    <option value="">대분류</option>
                    {allCategoryOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.category_sub}
                    onChange={(e) => setForm((f) => ({ ...f, category_sub: e.target.value }))}
                    disabled={!form.category_main}
                    className="border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none disabled:opacity-50"
                  >
                    <option value="">소분류 (선택)</option>
                    {(() => {
                      const main = form.category_main;
                      if (!main) return null;
                      const defaults =
                        (CATEGORY_SUB_MAP as Record<string, readonly string[]>)[main] ?? [];
                      const customs = customCategories
                        .filter((c) => c.category_main === main && c.category_sub)
                        .map((c) => c.category_sub)
                        .filter((s, i, arr) => arr.indexOf(s) === i && !defaults.includes(s));
                      return [...defaults, ...customs].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ));
                    })()}
                  </select>
                </div>
                <select
                  value={
                    form.payment_method_id
                      ? form.payment_method_id
                      : form.account_from_id
                        ? `account:${form.account_from_id}`
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith('account:')) {
                      setForm((f) => ({
                        ...f,
                        payment_method_id: '',
                        account_from_id: v.replace('account:', ''),
                      }));
                    } else {
                      setForm((f) => ({
                        ...f,
                        payment_method_id: v,
                        account_from_id: '',
                      }));
                    }
                  }}
                  className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                >
                  <option value="">결제수단 / 출금 계좌</option>
                  <optgroup label="💳 결제수단">
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>
                        {pm.name}
                      </option>
                    ))}
                  </optgroup>
                  {accounts.length > 0 && (
                    <optgroup label="🏦 계좌 (직접 출금)">
                      {accounts.map((a) => (
                        <option key={a.id} value={`account:${a.id}`}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={form.is_variable}
                    onChange={(e) => setForm((f) => ({ ...f, is_variable: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <span>
                    매월 금액이 다름{' '}
                    <span className="text-gray-400">(관리비·통신비 등)</span>
                  </span>
                </label>
              </div>
            )}

            {form.type === 'transfer' && (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">출금 계좌 (대여금)</label>
                  <select
                    value={form.account_from_id}
                    onChange={(e) => setForm((f) => ({ ...f, account_from_id: e.target.value }))}
                    className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">입금 계좌 (내 통장)</label>
                  <select
                    value={form.account_to_id}
                    onChange={(e) => setForm((f) => ({ ...f, account_to_id: e.target.value }))}
                    className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {form.type === 'income' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">입금 계좌</label>
                <select
                  value={form.account_to_id}
                  onChange={(e) => setForm((f) => ({ ...f, account_to_id: e.target.value }))}
                  className="w-full border border-indigo-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                >
                  <option value="">선택</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={cancelForm}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.amount || saving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1"
              >
                <Check size={14} /> {formMode === 'add' ? '저장' : '수정 저장'}
              </button>
            </div>
          </div>
        )}

        {/* 목록 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {ftLoading ? (
            <div className="p-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : fixedTemplates.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              <RepeatIcon size={28} className="mx-auto mb-2 text-gray-200" />
              <p>등록된 고정지출이 없어요</p>
              <p className="text-xs mt-1 text-gray-300">
                월세, 보험료, 구독료 등을 등록해두면
                <br />
                매월 등록 여부를 알려드려요
              </p>
            </div>
          ) : (
            fixedTemplates.map((ft, idx) => {
              const editing = formMode && typeof formMode === 'object' && formMode.id === ft.id;
              return (
                <div
                  key={ft.id}
                  className={`flex items-center justify-between px-4 py-3.5 ${
                    idx < fixedTemplates.length - 1 ? 'border-b border-gray-50' : ''
                  } ${editing ? 'bg-indigo-50/50' : ''}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${
                        ft.type === 'transfer'
                          ? 'bg-blue-50'
                          : ft.type === 'income'
                            ? 'bg-emerald-50'
                            : 'bg-indigo-50'
                      }`}
                    >
                      {ft.type === 'transfer' ? '🔄' : ft.type === 'income' ? '💰' : '💸'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{ft.name}</p>
                      <p className="text-xs text-gray-400 truncate">
                        매월 {ft.due_day}일
                        {ft.type === 'transfer' &&
                          ft.account_from &&
                          ` · ${ft.account_from.name} → ${ft.account_to?.name ?? ''}`}
                        {ft.type === 'income' && ft.account_to && ` · ${ft.account_to.name}`}
                        {ft.type === 'fixed_expense' &&
                          ft.category_main &&
                          ` · ${ft.category_main}`}
                        {ft.is_variable && ' · 변동'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-sm font-bold ${
                        ft.type === 'income'
                          ? 'text-emerald-600'
                          : ft.type === 'transfer'
                            ? 'text-blue-600'
                            : 'text-indigo-600'
                      }`}
                    >
                      {formatAmount(ft.amount)}
                    </span>
                    <button
                      onClick={() => startEdit(ft)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                      title="수정"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(ft.id)}
                      className="p-1.5 text-gray-300 hover:text-rose-500 rounded-lg hover:bg-rose-50"
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <p className="text-xs text-gray-400 px-1">등록일이 되면 홈 화면에서 미등록 알림을 드려요</p>
      </div>
    </div>
  );
}
