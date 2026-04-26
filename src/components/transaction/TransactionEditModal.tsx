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
    target_member_ids:
      (tx.target_member_ids && tx.target_member_ids.length > 0
        ? tx.target_member_ids
        : tx.target_member_id
          ? [tx.target_member_id]
          : []) as string[],
    receipt_url: tx.receipt_url ?? '',
  });

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 세부 품목
  interface ItemRow { id: string; name: string; price: number; quantity: number; unit: string; category_main: string; category_sub: string; track: boolean; }
  const [items, setItems] = useState<ItemRow[]>([]);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);
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

  // 품목별 소분류 추가 (main을 명시적으로 받음)
  const handleAddSubCategoryFor = async (main: string, sub: string) => {
    if (!main) return;
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: main, category_sub: sub }),
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
          target_member_id: form.target_member_ids[0] || null,
          target_member_ids: form.target_member_ids,
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
      .then((d) => { setItems(d.items ?? []); setItemsLoaded(true); })
      .catch((e) => {
        console.error('[items load]', e);
        // 실패해도 섹션은 표시 (빈 목록 + 추가 가능)
        setItems([]);
        setItemsLoaded(true);
      });
  }, [tx.id]);

  const updateItem = (id: string, fields: Partial<ItemRow>) => {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...fields } : i));
  };

  const isLocalNewItem = (id: string) => id.startsWith('new-');

  const addNewItem = () => {
    const localId = `new-${Date.now()}`;
    setItems((prev) => [
      ...prev,
      {
        id: localId,
        name: '',
        price: 0,
        quantity: 1,
        unit: '개',
        category_main: '',
        category_sub: '',
        track: false,
      },
    ]);
    setExpandedItemId(localId);
  };

  const removeItem = async (item: ItemRow) => {
    if (isLocalNewItem(item.id)) {
      // 미저장 로컬 행은 그냥 제거
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      return;
    }
    if (!confirm('이 품목을 삭제할까요?')) return;
    setItemsSaving(true);
    try {
      const res = await fetch(
        `/api/transactions/${tx.id}/items?item_id=${item.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setItemError((e as Error).message);
    } finally {
      setItemsSaving(false);
    }
  };

  const saveItem = async (item: ItemRow) => {
    setItemsSaving(true);
    setItemError(null);
    try {
      if (isLocalNewItem(item.id)) {
        // 신규: POST
        if (!item.name.trim() || item.price <= 0) {
          throw new Error('품목명과 금액을 입력해주세요.');
        }
        const res = await fetch(`/api/transactions/${tx.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                price: item.price,
                category_main: item.category_main,
                category_sub: item.category_sub,
                track: !!item.track,
              },
            ],
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const newId = json.items?.[0]?.id ?? item.id;
        // 로컬 id를 실제 id로 교체
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, id: newId } : i))
        );
        setSavedItemId(newId);
        setExpandedItemId(newId);
        setTimeout(() => setSavedItemId((prev) => (prev === newId ? null : prev)), 1500);
      } else {
        // 기존: PATCH
        const res = await fetch(
          `/api/transactions/${tx.id}/items?item_id=${item.id}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              price: item.price,
              category_main: item.category_main,
              category_sub: item.category_sub,
              track: !!item.track,
            }),
          }
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setSavedItemId(item.id);
        setTimeout(() => setSavedItemId((prev) => (prev === item.id ? null : prev)), 1500);
      }
    } catch (e) {
      setItemError((e as Error).message);
    } finally {
      setItemsSaving(false);
    }
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
              value={form.amountStr ?? ''}
              onChange={(e) => {
                const raw = numOnly(e.target.value);
                setForm((f) => ({ ...f, amountStr: raw, amount: parseInt(raw) || 0 }));
              }}
              className="text-3xl font-bold text-center w-full border-b-2 border-indigo-400 outline-none pb-1 bg-transparent"
              placeholder="0"
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.amountStr ? `${Number(form.amountStr).toLocaleString('ko-KR')}원` : '원'}
            </p>
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, merchant_name: e.target.value }))
                }
                placeholder="어디서?"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>

          {/* 구매항목 (가맹점과 별도) */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">
              구매항목 <span className="text-gray-300">(가맹점과 별도)</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="무엇을?"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
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

            {/* 계좌이체 결제수단 선택 시: 출금 계좌 */}
            {(() => {
              const selectedPM = paymentMethods.find((pm) => pm.id === form.payment_method_id);
              if (selectedPM?.type !== 'bank_transfer' || form.type === 'transfer') return null;
              return (
                <div className="mt-2 bg-emerald-50 rounded-xl p-2.5">
                  <label className="text-xs text-emerald-700 font-medium mb-1 block">
                    🏦 출금 계좌
                  </label>
                  <select
                    value={form.account_from_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, account_from_id: e.target.value }))
                    }
                    className="w-full border border-emerald-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    <option value="">선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}
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
              {/* 지출 대상 (다중 선택) */}
              <div>
                <label className="text-xs font-medium mb-2 block text-gray-500">
                  🎯 지출 대상 <span className="text-gray-300">(공용 또는 특정 인원)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setForm((f) => ({ ...f, target_member_ids: [] }))}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      form.target_member_ids.length === 0
                        ? 'bg-slate-600 text-white border-transparent'
                        : 'bg-white border-gray-200 text-gray-500'
                    }`}
                    title="가족 모두를 위한 지출 (식자재, 관리비 등)"
                  >
                    🏠 공용
                  </button>
                  {members.map((m) => {
                    const selected = form.target_member_ids.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            target_member_ids: selected
                              ? f.target_member_ids.filter((id) => id !== m.id)
                              : [...f.target_member_ids, m.id],
                          }))
                        }
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                          selected ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                        }`}
                        style={selected ? { backgroundColor: m.color, borderColor: m.color } : {}}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: selected ? 'rgba(255,255,255,0.8)' : m.color }}
                        />
                        {m.name}
                        {selected && <span className="text-[11px] ml-0.5">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 세부 품목 */}
          <div className="bg-indigo-50/40 rounded-2xl p-3 border border-indigo-100">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-indigo-500" />
                <p className="text-sm font-bold text-indigo-700">
                  세부 품목 {items.length > 0 && `(${items.length})`}
                  {itemsSaving && <span className="text-indigo-400 ml-1 text-xs font-normal">저장 중...</span>}
                  {!itemsLoaded && <span className="text-gray-400 ml-1 text-xs font-normal">로딩…</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={addNewItem}
                className="px-2.5 py-1 bg-indigo-600 text-white text-xs font-semibold rounded-lg active:bg-indigo-700"
              >
                + 품목 추가
              </button>
            </div>
              {items.length === 0 && (
                <div className="bg-gray-50 rounded-2xl px-4 py-6 text-center text-xs text-gray-400 mb-2">
                  세부 품목이 없습니다. 위의 "+ 품목 추가" 버튼으로 추가하세요.
                </div>
              )}
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="bg-gray-50 rounded-2xl">
                    {/* 헤더 (탭하면 확장) */}
                    <button
                      type="button"
                      onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isLocalNewItem(item.id) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">
                            신규
                          </span>
                        )}
                        <span
                          className={`text-sm font-medium truncate ${
                            item.name ? 'text-gray-800' : 'text-gray-400'
                          }`}
                        >
                          {item.name || '품목명 미입력'}
                        </span>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {item.quantity}{item.unit} · {item.price.toLocaleString('ko-KR')}원
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {item.category_main && (
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{item.category_main}</span>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item);
                          }}
                          className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50"
                          title="삭제"
                        >
                          <Trash2 size={13} />
                        </span>
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
                        {/* 수량 / 단위 */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">수량</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={(e) => {
                                // 숫자 + 소수점 1개만 허용
                                const raw = e.target.value
                                  .replace(/[^0-9.]/g, '')
                                  .replace(/(\..*)\./g, '$1');
                                updateItem(item.id, {
                                  quantity: raw === '' || raw === '.' ? 1 : parseFloat(raw),
                                });
                              }}
                              onFocus={(e) => e.target.select()}
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">단위 (직접입력 가능)</label>
                            <input
                              type="text"
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                              placeholder="개, 300g, 500ml, 캔 ..."
                              className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          </div>
                        </div>
                        {/* 총 가격 / 단가 표시 */}
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">총 가격 (원)</label>
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
                          {item.quantity > 1 && item.price > 0 && (
                            <p className="text-xs text-indigo-500 mt-1 px-1">
                              = {Math.round(item.price / item.quantity).toLocaleString('ko-KR')}원/{item.unit || '개'}
                            </p>
                          )}
                        </div>
                        {/* 대분류 / 소분류 */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">대분류</label>
                            <CategoryCombobox
                              value={item.category_main}
                              onChange={(v) =>
                                updateItem(item.id, { category_main: v, category_sub: '' })
                              }
                              options={allMainCategories as unknown as string[]}
                              onAddOption={handleAddMainCategory}
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">소분류</label>
                            <CategoryCombobox
                              value={item.category_sub}
                              onChange={(v) => updateItem(item.id, { category_sub: v })}
                              options={getSubOptions(item.category_main)}
                              disabled={!item.category_main}
                              onAddOption={
                                item.category_main
                                  ? (sub) => handleAddSubCategoryFor(item.category_main, sub)
                                  : undefined
                              }
                            />
                          </div>
                        </div>
                        {/* 품목 추적 토글 */}
                        <label className="flex items-center gap-2 cursor-pointer px-1 py-1 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!item.track}
                            onChange={(e) => updateItem(item.id, { track: e.target.checked })}
                            className="rounded border-gray-300 accent-indigo-500"
                          />
                          <span>📊 품목 추적에 추가</span>
                        </label>
                        {itemError && savedItemId !== item.id && (
                          <div className="text-xs text-red-500 px-1">{itemError}</div>
                        )}
                        {/* 저장 버튼 */}
                        <button
                          type="button"
                          onClick={() => saveItem(item)}
                          disabled={itemsSaving}
                          className={`w-full py-2 text-sm font-medium rounded-xl transition-colors ${
                            savedItemId === item.id
                              ? 'bg-emerald-500 text-white'
                              : 'bg-indigo-600 text-white active:bg-indigo-700 disabled:opacity-60'
                          }`}
                        >
                          {savedItemId === item.id
                            ? '✓ 저장됨'
                            : itemsSaving
                              ? '저장 중…'
                              : '이 품목 저장'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
          </div>

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
