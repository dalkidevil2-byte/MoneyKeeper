'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, ExternalLink, Trash2, CheckCircle, ChevronDown, ChevronUp, ShoppingBag } from 'lucide-react';
import dayjs from 'dayjs';
import { formatAmount } from '@/lib/parser';
import { usePaymentMethods, useMembers, useCustomCategories } from '@/hooks/useAccounts';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import CategoryCombobox from '@/components/CategoryCombobox';
import ReceiptAttachment from '@/components/ReceiptAttachment';

type Priority = 'high' | 'medium' | 'low';
type Status = 'pending' | 'purchased';

interface WishItem {
  id: string;
  name: string;
  price: number;
  priority: Priority;
  category_main: string;
  category_sub: string;
  url: string;
  image_url: string;
  memo: string;
  status: Status;
  purchased_at: string | null;
  created_at: string;
}

const PRIORITY_LABELS: Record<Priority, { label: string; color: string; bg: string }> = {
  high:   { label: '높음', color: 'text-rose-600',   bg: 'bg-rose-50' },
  medium: { label: '중간', color: 'text-amber-600',  bg: 'bg-amber-50' },
  low:    { label: '낮음', color: 'text-gray-500',   bg: 'bg-gray-100' },
};

const numOnly = (v: string) => v.replace(/[^0-9]/g, '');

export default function WishlistPage() {
  const [items, setItems] = useState<WishItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [showPurchased, setShowPurchased] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null); // item id being purchased
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

  const [form, setForm] = useState({
    name: '', price: '', priority: 'medium' as Priority,
    category_main: '', category_sub: '', url: '', image_url: '', memo: '',
  });

  // 구매 전환 폼
  const [buyForm, setBuyForm] = useState({
    date: dayjs().format('YYYY-MM-DD'),
    payment_method_id: '',
    member_id: '',
  });

  const fetchItems = useCallback(() => {
    setLoading(true);
    fetch('/api/wishlists')
      .then((r) => r.json())
      .then((d) => setItems(d.wishlists ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleAdd = async () => {
    if (!form.name) return;
    await fetch('/api/wishlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, price: parseInt(form.price) || 0 }),
    });
    setForm({ name: '', price: '', priority: 'medium', category_main: '', category_sub: '', url: '', image_url: '', memo: '' });
    setAdding(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/wishlists?id=${id}`, { method: 'DELETE' });
    fetchItems();
  };

  const handlePurchase = async (item: WishItem) => {
    // 1. 거래내역 등록
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: buyForm.date,
        type: 'variable_expense',
        amount: item.price,
        name: item.name,
        merchant_name: item.name,
        category_main: item.category_main,
        category_sub: item.category_sub,
        payment_method_id: buyForm.payment_method_id || null,
        member_id: buyForm.member_id || null,
        memo: `위시리스트 구매`,
        receipt_url: item.url,
        input_type: 'manual',
      }),
    });
    // 2. 위시리스트 상태 업데이트
    await fetch('/api/wishlists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, status: 'purchased', purchased_at: buyForm.date }),
    });
    setPurchasing(null);
    fetchItems();
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

  const pending   = items.filter((i) => i.status === 'pending');
  const purchased = items.filter((i) => i.status === 'purchased');
  const totalPrice = pending.reduce((s, i) => s + i.price, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">위시리스트 💝</h1>
            {pending.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">
                {pending.length}개 · 합계 {formatAmount(totalPrice)}
              </p>
            )}
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium"
          >
            <Plus size={16} /> 추가
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">
        {/* 추가 폼 */}
        {adding && (
          <div className="bg-white rounded-2xl border border-indigo-100 p-4 space-y-3 shadow-sm">
            <p className="text-sm font-semibold text-gray-700">새 위시 아이템</p>

            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="갖고 싶은 것"
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={form.price ? Number(form.price).toLocaleString('ko-KR') : ''}
                onChange={(e) => setForm((f) => ({ ...f, price: numOnly(e.target.value) }))}
                placeholder="예상 가격"
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {/* 우선순위 */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200">
                {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, priority: p }))}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${form.priority === p ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
                  >
                    {PRIORITY_LABELS[p].label}
                  </button>
                ))}
              </div>
            </div>

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

            <ReceiptAttachment
              value={form.image_url || form.url}
              onChange={(url) => {
                const isImg = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || url.includes('/storage/');
                setForm((f) => isImg ? { ...f, image_url: url, url: '' } : { ...f, url, image_url: '' });
              }}
            />

            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="메모 (선택)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />

            <div className="flex gap-2">
              <button onClick={() => setAdding(false)} className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
              <button onClick={handleAdd} disabled={!form.name} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40">추가</button>
            </div>
          </div>
        )}

        {/* 대기 중 목록 */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : pending.length === 0 && !adding ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">💝</p>
            <p className="text-gray-500 font-medium">위시리스트가 비어있어요</p>
            <p className="text-xs text-gray-400 mt-1">갖고 싶은 것들을 추가해보세요</p>
          </div>
        ) : (
          <div className="space-y-2">
            {pending
              .sort((a, b) => {
                const order = { high: 0, medium: 1, low: 2 };
                return order[a.priority] - order[b.priority];
              })
              .map((item) => (
                <div key={item.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {/* 이미지 */}
                  {item.image_url && (
                    <img src={item.image_url} alt={item.name} className="w-full h-32 object-cover" />
                  )}

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_LABELS[item.priority].bg} ${PRIORITY_LABELS[item.priority].color}`}>
                            {PRIORITY_LABELS[item.priority].label}
                          </span>
                          {item.category_main && (
                            <span className="text-xs text-gray-400">{item.category_main}</span>
                          )}
                        </div>
                        <p className="font-semibold text-gray-800">{item.name}</p>
                        {item.price > 0 && (
                          <p className="text-sm font-bold text-indigo-600 mt-0.5">{formatAmount(item.price)}</p>
                        )}
                        {item.memo && <p className="text-xs text-gray-400 mt-1">{item.memo}</p>}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-indigo-500 mt-1">
                            <ExternalLink size={11} /> 링크 보기
                          </a>
                        )}
                      </div>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-300 hover:text-rose-400 rounded-lg">
                        <Trash2 size={15} />
                      </button>
                    </div>

                    {/* 구매 완료 */}
                    {purchasing === item.id ? (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-xs font-medium text-gray-500">거래내역 등록</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={buyForm.date}
                            onChange={(e) => setBuyForm((f) => ({ ...f, date: e.target.value }))}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none" />
                          <select value={buyForm.payment_method_id}
                            onChange={(e) => setBuyForm((f) => ({ ...f, payment_method_id: e.target.value }))}
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
                            <option value="">결제수단</option>
                            {paymentMethods.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                          </select>
                        </div>
                        {members.length > 1 && (
                          <select value={buyForm.member_id}
                            onChange={(e) => setBuyForm((f) => ({ ...f, member_id: e.target.value }))}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
                            <option value="">결제자 선택</option>
                            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => setPurchasing(null)} className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm">취소</button>
                          <button onClick={() => handlePurchase(item)} className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium">구매 완료</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setPurchasing(item.id); setBuyForm({ date: dayjs().format('YYYY-MM-DD'), payment_method_id: '', member_id: '' }); }}
                        className="mt-3 w-full py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5"
                      >
                        <ShoppingBag size={14} /> 구매했어요
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* 구매 완료 목록 */}
        {purchased.length > 0 && (
          <div>
            <button
              onClick={() => setShowPurchased((v) => !v)}
              className="flex items-center gap-2 text-sm text-gray-400 font-medium py-2"
            >
              <CheckCircle size={15} className="text-emerald-400" />
              구매 완료 {purchased.length}개
              {showPurchased ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showPurchased && (
              <div className="space-y-2">
                {purchased.map((item) => (
                  <div key={item.id} className="bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-center gap-3 opacity-60">
                    <CheckCircle size={18} className="text-emerald-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-600 line-through">{item.name}</p>
                      {item.price > 0 && <p className="text-xs text-gray-400">{formatAmount(item.price)}</p>}
                    </div>
                    {item.purchased_at && (
                      <p className="text-xs text-gray-400 flex-shrink-0">{dayjs(item.purchased_at).format('M/D')}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
