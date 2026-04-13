'use client';

import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, CheckCircle, AlertCircle, ChevronDown, Package } from 'lucide-react';
import type { Transaction } from '@/types';
import {
  TRANSACTION_TYPE_LABELS,
  CATEGORY_MAIN_OPTIONS,
  CATEGORY_SUB_MAP,
} from '@/types';
import { useAccounts, usePaymentMethods, useMembers, useCustomCategories } from '@/hooks/useAccounts';
import CategoryCombobox from '@/components/CategoryCombobox';
import ReceiptAttachment from '@/components/ReceiptAttachment';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

interface Props {
  transaction: Transaction;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function TransactionEditModal({ transaction: tx, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState({
    date: tx.date,
    type: tx.type,
    amount: tx.amount,
    amountStr: tx.amount.toString(),
    name: tx.name ?? '',
    merchant_name: tx.merchant_name ?? '',
    category_main: tx.category_main ?? '',
    category_sub: tx.category_sub ?? '',
    payment_method_id: tx.payment_method_id ?? '',
    account_from_id: tx.account_from_id ?? '',
    account_to_id: tx.account_to_id ?? '',
    memo: tx.memo ?? '',
    member_id: tx.member_id ?? '',
    target_member_id: tx.target_member_id ?? '',
    receipt_url: tx.receipt_url ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 세부 품목
  interface ItemRow { id: string; name: string; price: number; quantity: number; unit: string; category_main: string; category_sub: string; }
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemsSaving, setItemsSaving] = useState(false);

  const { accounts } = useAccounts();
  const { paymentMethods } = usePaymentMethods();
  const { members } = useMembers();
  const { categories: customCategories, refetch: refetchCategories } = useCustomCategories();

  const allMainCategories = useMemo(() => {
    const customs = customCategories
      .map((c) => c.category_main)
      .filter((m, i, arr) => m && arr.indexOf(m) === i && !CATEGORY_MAIN_OPTIONS.includes(m as any));
    return [...CATEGORY_MAIN_OPTIONS, ...customs];
  }, [customCategories]);

  const getSubOptions = (main: string) => {
    const defaults = CATEGORY_SUB_MAP[main] ?? [];
    const customs = customCategories
      .filter((c) => c.category_main === main && c.category_sub)
      .map((c) => c.category_sub)
      .filter((s, i, arr) => arr.indexOf(s) === i && !defaults.includes(s));
    return [...defaults, ...customs];
  };

  const handleAddMainCategory = async (name: string) => {
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: name, category_sub: '' }),
    });
    refetchCategories();
  };

  const handleAddSubCategory = async (sub: string) => {
    if (!form.category_main) return;
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: form.category_main, category_sub: sub }),
    });
    refetchCategories();
  };

  const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

  const handleSave = async () => {
    if (!form.amount || !form.date) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          type: form.type,
          amount: form.amount,
          name: form.name,
          merchant_name: form.merchant_name,
          category_main: form.category_main,
          category_sub: form.category_sub,
          payment_method_id: form.payment_method_id || null,
          account_from_id: form.account_from_id || null,
          account_to_id: form.account_to_id || null,
          member_id: form.member_id || null,
          target_member_id: form.target_member_id || null,
          receipt_url: form.receipt_url,
          memo: form.memo,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetch(`/api/transactions/${tx.id}/items`)
      .then((r) => r.json())
      .then((d) => { setItems(d.items ?? []); setItemsLoaded(true); });
  }, [tx.id]);

  const updateItem = (id: string, fields: Partial<ItemRow>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...fields } : i));
  };

  const saveItem = async (item: ItemRow) => {
    setItemsSaving(true);
    await fetch(`/api/transactions/${tx.id}/items?item_id=${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        category_main: item.category_main,
        category_sub: item.category_sub,
      }),
    });
    setItemsSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      onDeleted();
    } catch (e: any) {
      setError(e.message);
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto pb-safe">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 sticky top-5 bg-white border-b border-gray-50">
          <h2 className="text-lg font-bold text-gray-900">거래 수정</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 금액 */}
          <div className="text-center py-2">
            <input
              type="text"
              inputMode="numeric"
              value={form.amountStr ? Number(form.amountStr).toLocaleString('ko-KR') : ''}
              onChange={(e) => {
                const raw = numOnly(e.target.value);
                setForm((f) => ({ ...f, amountStr: raw, amount: parseInt(raw) || 0 }));
              }}
              className="text-3xl font-bold text-center w-full border-b-2 border-indigo-400 outline-none pb-1 bg-transparent"
              placeholder="금액"
            />
            <p className="text-xs text-gray-400 mt-1">원</p>
          </div>

          {/* 유형 탭 */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {(['income', 'variable_expense', 'fixed_expense', 'transfer'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, type: t }))}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  form.type === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                }`}
              >
                {TRANSACTION_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          {/* 날짜 + 가맹점 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">날짜</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">가맹점</label>
              <input
                type="text"
                value={form.merchant_name}
                onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value, name: e.target.value }))}
                placeholder="어디서?"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* 카테고리 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">대분류</label>
              <CategoryCombobox
                value={form.category_main}
                onChange={(v) => setForm((f) => ({ ...f, category_main: v, category_sub: '' }))}
                options={allMainCategories as unknown as string[]}
                placeholder="선택"
                onAddOption={handleAddMainCategory}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">소분류</label>
              <CategoryCombobox
                value={form.category_sub}
                onChange={(v) => setForm((f) => ({ ...f, category_sub: v }))}
                options={getSubOptions(form.category_main)}
                placeholder="선택"
                disabled={!form.category_main}
                onAddOption={form.category_main ? handleAddSubCategory : undefined}
              />
            </div>
          </div>

          {/* 결제수단 */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">결제수단</label>
            <select
              value={form.payment_method_id}
              onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
            >
              <option value="">선택 안함</option>
              {form.member_id
                ? (() => {
                    const mine = paymentMethods.filter((pm) => pm.member_id === form.member_id);
                    const shared = paymentMethods.filter((pm) => !pm.member_id);
                    return (
                      <>
                        {mine.length > 0 && (
                          <optgroup label={members.find((m) => m.id === form.member_id)?.name ?? ''}>
                            {mine.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                          </optgroup>
                        )}
                        {shared.length > 0 && (
                          <optgroup label="공용">
                            {shared.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                          </optgroup>
                        )}
                      </>
                    );
                  })()
                : paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))
              }
            </select>
          </div>

          {/* 자금이동 계좌 */}
          {form.type === 'transfer' && (
            <div className="bg-blue-50 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-blue-600">🔄 자금 이동 계좌</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">출금 계좌</label>
                  <select
                    value={form.account_from_id}
                    onChange={(e) => setForm((f) => ({ ...f, account_from_id: e.target.value }))}
                    className="w-full border border-blue-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none"
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">입금 계좌</label>
                  <select
                    value={form.account_to_id}
                    onChange={(e) => setForm((f) => ({ ...f, account_to_id: e.target.value }))}
                    className="w-full border border-blue-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none"
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 결제자 + 지출 대상 */}
          {members.length > 1 && (
            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
              {/* 결제자 */}
              <div>
                <label className="text-xs font-medium mb-2 block text-gray-500">💳 결제자</label>
                <div className="flex gap-2 flex-wrap">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setForm((f) => ({ ...f, member_id: f.member_id === m.id ? '' : m.id }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                        form.member_id === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                      style={form.member_id === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.member_id === m.id ? 'rgba(255,255,255,0.7)' : m.color }} />
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              {/* 지출 대상 */}
              <div>
                <label className="text-xs font-medium mb-2 block text-gray-500">🎯 지출 대상</label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setForm((f) => ({ ...f, target_member_id: '' }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      !form.target_member_id ? 'bg-violet-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                    }`}
                  >
                    🫂 함께
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setForm((f) => ({ ...f, target_member_id: f.target_member_id === m.id ? '' : m.id }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                        form.target_member_id === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                      style={form.target_member_id === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.target_member_id === m.id ? 'rgba(255,255,255,0.7)' : m.color }} />
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 세부 품목 */}
          {itemsLoaded && items.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Package size={14} className="text-indigo-400" />
                <p className="text-xs font-medium text-gray-500">세부 품목 수정 {itemsSaving && <span className="text-indigo-400">저장 중...</span>}</p>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-2xl overflow-hidden">
                    {/* 헤더 (탭하면 확장) */}
                    <button
                      type="button"
                      onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate">{item.name}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {item.quantity}{item.unit} · {item.price.toLocaleString('ko-KR')}원
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.category_main && (
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{item.category_main}</span>
                        )}
                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${expandedItemId === item.id ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* 확장 편집 폼 */}
                    {expandedItemId === item.id && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-3">
                        {/* 품목명 */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">품목명</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, { name: e.target.value })}
                            className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                          />
                        </div>
                        {/* 수량 / 단위 / 가격 */}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">수량</label>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 1 })}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">단위</label>
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                            >
                              {['개','캔','병','봉','팩','박스','장','구','인분','묶음','롤','포','g','kg','ml','L'].map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">가격(원)</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.price ? item.price.toLocaleString('ko-KR') : ''}
                              onChange={(e) => {
                                const n = parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0;
                                updateItem(item.id, { price: n });
                              }}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                        </div>
                        {/* 대분류 / 소분류 */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">대분류</label>
                            <select
                              value={item.category_main}
                              onChange={(e) => updateItem(item.id, { category_main: e.target.value, category_sub: '' })}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                            >
                              <option value="">선택</option>
                              {allMainCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">소분류</label>
                            <select
                              value={item.category_sub}
                              onChange={(e) => updateItem(item.id, { category_sub: e.target.value })}
                              disabled={!item.category_main}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none disabled:opacity-40"
                            >
                              <option value="">선택</option>
                              {getSubOptions(item.category_main).map((s) => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        {/* 저장 버튼 */}
                        <button
                          type="button"
                          onClick={() => saveItem(item)}
                          className="w-full py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl"
                        >
                          이 품목 저장
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 메모 */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">메모</label>
            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="메모 (선택)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>

          {/* 참고 자료 */}
          <ReceiptAttachment
            value={form.receipt_url}
            onChange={(url) => setForm((f) => ({ ...f, receipt_url: url }))}
          />

          {/* 에러 */}
          {error && (
            <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 rounded-xl p-3">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* 버튼 영역 */}
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-3.5 border border-gray-200 text-gray-600 font-medium rounded-2xl"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.amount}
                className="flex-[2] py-3.5 bg-indigo-600 text-white font-semibold rounded-2xl disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {saving
                  ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <><CheckCircle size={18} /> 저장</>
                }
              </button>
            </div>

            {/* 삭제 버튼 */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`w-full py-3 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${
                confirmDelete
                  ? 'bg-rose-500 text-white'
                  : 'bg-rose-50 text-rose-500'
              }`}
            >
              <Trash2 size={16} />
              {deleting ? '삭제 중...' : confirmDelete ? '정말 삭제할까요? 한번 더 탭하세요' : '삭제'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
