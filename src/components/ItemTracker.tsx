'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Search, TrendingDown, Store, ChevronRight, X, Pencil, Check, Trash2 } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

interface StoreAvg { store: string; avg: number; count: number }
interface HistoryRecord {
  id?: string;              // items.id (편집용)
  transaction_id?: string;  // 편집용
  date: string;
  price: number;
  unit_price: number;
  quantity: number;
  unit: string;
  store: string;
}

interface Item {
  name: string;
  category: string;
  unit: string;
  count: number;
  avgUnitPrice: number;
  minUnitPrice: number;
  maxUnitPrice: number;
  lastDate: string;
  cheapest: HistoryRecord;
  storeAvg: StoreAvg[];
  avgGap: number | null;
  history: HistoryRecord[];
}

const CATEGORY_EMOJI: Record<string, string> = {
  식비: '🍽️', 카페: '☕', 교통: '🚌', 쇼핑: '🛍️', 의료: '💊',
  교육: '📚', 취미: '🎮', 고정비: '🔒', 생활: '🧺',
  주거: '🏠', '저축/투자': '📈', 육아: '👶', 기타: '📦',
};

function PriceChart({ item }: { item: Item }) {
  const data = item.history.map((r) => ({
    date: dayjs(r.date).format('M/D'),
    unit_price: r.unit_price,
    quantity: r.quantity,
    store: r.store,
  }));

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const isCheapest = payload.unit_price === item.minUnitPrice;
    if (isCheapest) {
      return <circle cx={cx} cy={cy} r={5} fill="#10b981" stroke="white" strokeWidth={2} />;
    }
    return <circle cx={cx} cy={cy} r={3} fill="#6366f1" stroke="white" strokeWidth={1.5} />;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
        <p className="font-semibold text-gray-800">{formatAmount(d.unit_price)}/{d.unit || '개'}</p>
        {d.quantity > 1 && (
          <p className="text-gray-500">{d.quantity}{d.unit || '개'} × {formatAmount(d.unit_price)} = {formatAmount(d.unit_price * d.quantity)}</p>
        )}
        <p className="text-gray-400">{d.date} · {d.store}</p>
        {d.unit_price === item.minUnitPrice && (
          <p className="text-emerald-500 font-medium mt-0.5">🏆 최저 단가</p>
        )}
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={48}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}천`}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={item.avgUnitPrice} stroke="#e5e7eb" strokeDasharray="4 4" />
        <Line
          type="monotone"
          dataKey="unit_price"
          stroke="#6366f1"
          strokeWidth={2}
          dot={<CustomDot />}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ItemDetail({
  item,
  onClose,
  onRenamed,
}: {
  item: Item;
  onClose: () => void;
  onRenamed?: () => void;
}) {
  const savings = item.maxUnitPrice - item.minUnitPrice;
  const savingsPct = item.maxUnitPrice > 0 ? Math.round((savings / item.maxUnitPrice) * 100) : 0;

  // 편집 상태
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [newUnit, setNewUnit] = useState(item.unit);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);


  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 구매 이력 추가 상태
  const [adding, setAdding] = useState(false);
  const [txList, setTxList] = useState<
    Array<{ id: string; date: string; merchant_name: string; amount: number }>
  >([]);
  const [addTxId, setAddTxId] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addPrice, setAddPrice] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const openAdd = async () => {
    setAdding(true);
    setAddErr(null);
    setAddQty('1');
    setAddPrice(String(item.avgUnitPrice));
    try {
      const res = await fetch('/api/transactions?limit=100');
      const j = await res.json();
      setTxList(j.transactions ?? []);
      if ((j.transactions ?? []).length) setAddTxId(j.transactions[0].id);
    } catch (e) {
      setAddErr('거래 목록 로드 실패: ' + (e as Error).message);
    }
  };

  const saveAdd = async () => {
    setAddErr(null);
    const q = parseFloat(addQty);
    const p = parseInt(addPrice.replace(/[^0-9]/g, ''));
    if (!addTxId) return setAddErr('거래를 선택해주세요.');
    if (!isFinite(q) || q <= 0) return setAddErr('수량을 올바르게 입력해주세요.');
    if (!isFinite(p) || p <= 0) return setAddErr('가격을 올바르게 입력해주세요.');

    setAddSaving(true);
    try {
      const res = await fetch(`/api/transactions/${addTxId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              name: item.name,
              quantity: q,
              price: p,
              unit: item.unit,
              category_main: item.category,
              category_sub: '',
              track: true,
            },
          ],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setAdding(false);
      onRenamed?.();
      onClose();
    } catch (e) {
      setAddErr((e as Error).message);
    } finally {
      setAddSaving(false);
    }
  };

  const deleteRecord = async (r: HistoryRecord) => {
    if (!r.id || !r.transaction_id) {
      alert('이 이력은 삭제할 수 없습니다 (ID 없음).');
      return;
    }
    if (!confirm(`${dayjs(r.date).format('YYYY.MM.DD')} ${r.store} 구매 이력을 삭제할까요?`)) {
      return;
    }
    setDeletingId(r.id);
    try {
      const res = await fetch(
        `/api/transactions/${r.transaction_id}/items?item_id=${r.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onRenamed?.(); // 목록 재로드
      onClose();
    } catch (e) {
      alert('삭제 실패: ' + (e as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  const saveRename = async () => {
    setErr(null);
    const n = newName.trim();
    const u = newUnit.trim() || '개';
    if (!n) return setErr('품목명을 입력해주세요.');
    if (n === item.name && u === item.unit) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/items/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: { name: item.name, unit: item.unit },
          to: { name: n, unit: u },
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setEditing(false);
      onRenamed?.();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0 gap-2">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{CATEGORY_EMOJI[item.category] ?? '📦'}</span>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="품목명"
                    className="flex-1 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-[11px] text-gray-400">단위</label>
                  <input
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="개, L, kg..."
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                  <div className="flex-1 text-[11px] text-gray-400">
                    {item.count}회 구매 전부 일괄 변경
                  </div>
                </div>
                {err && <div className="text-[11px] text-red-500">{err}</div>}
              </div>
            ) : (
              <>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <span>{CATEGORY_EMOJI[item.category] ?? '📦'}</span>
                  <span className="truncate">{item.name}</span>
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {item.count}회 구매 · {item.category} · 단위 {item.unit}
                </p>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={saveRename}
                  disabled={saving}
                  className="p-2 rounded-full text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                  title="저장"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setNewName(item.name);
                    setNewUnit(item.unit);
                    setErr(null);
                  }}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  title="취소"
                >
                  <X size={18} />
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 rounded-full hover:bg-gray-100 text-gray-500"
                  title="품목명/단위 수정"
                >
                  <Pencil size={16} />
                </button>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
                  <X size={18} className="text-gray-500" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* 단가 요약 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">평균 단가</p>
              <p className="text-sm font-bold text-gray-800">{formatAmount(item.avgUnitPrice)}<span className="text-xs font-normal">/{item.unit}</span></p>
              <p className="text-[10px] text-gray-400 mt-0.5">단위당</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-emerald-600 mb-1">최저 단가 🏆</p>
              <p className="text-sm font-bold text-emerald-700">{formatAmount(item.minUnitPrice)}<span className="text-xs font-normal">/{item.unit}</span></p>
              <p className="text-[10px] text-emerald-500 mt-0.5">{item.cheapest.store}</p>
            </div>
            <div className="bg-rose-50 rounded-2xl p-3 text-center">
              <p className="text-xs text-rose-500 mb-1">최고 단가</p>
              <p className="text-sm font-bold text-rose-600">{formatAmount(item.maxUnitPrice)}<span className="text-xs font-normal">/{item.unit}</span></p>
              <p className="text-[10px] text-rose-400 mt-0.5">단위당</p>
            </div>
          </div>

          {savings > 0 && (
            <div className="bg-indigo-50 rounded-2xl px-4 py-3 flex items-center gap-3">
              <TrendingDown size={18} className="text-indigo-500 flex-shrink-0" />
              <p className="text-sm text-indigo-700">
                최저가 매장에서 사면 개당 <span className="font-bold">{formatAmount(savings)}</span> 절약
                <span className="text-indigo-400 text-xs ml-1">({savingsPct}% 차이)</span>
              </p>
            </div>
          )}

          {/* 단가 추이 차트 */}
          {item.history.length >= 2 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">단가 추이 (개당)</p>
              <div className="bg-white border border-gray-100 rounded-2xl p-3">
                <PriceChart item={item} />
                <p className="text-[10px] text-gray-400 text-center mt-1">● 일반 구매 &nbsp; 🟢 최저 단가</p>
              </div>
            </div>
          )}

          {/* 매장별 단가 비교 */}
          {item.storeAvg.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">매장별 평균 단가</p>
              <div className="space-y-2">
                {item.storeAvg.map((s, i) => (
                  <div key={s.store} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      i === 0 ? 'bg-emerald-100' : 'bg-gray-100'
                    }`}>
                      <Store size={14} className={i === 0 ? 'text-emerald-600' : 'text-gray-500'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.store}</p>
                      <p className="text-xs text-gray-400">{s.count}회 구매</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${i === 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {formatAmount(s.avg)}<span className="text-xs font-normal">/{item.unit}</span>
                      </p>
                      {i === 0 && <p className="text-[10px] text-emerald-500">가장 저렴</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 구매 이력 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-gray-500">구매 이력</p>
              {!adding && (
                <button
                  type="button"
                  onClick={openAdd}
                  className="text-xs text-indigo-600 font-semibold"
                >
                  + 구매 이력 추가
                </button>
              )}
            </div>

            {adding && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 mb-2 space-y-2">
                <div>
                  <label className="text-[11px] text-gray-500">거래 선택</label>
                  <select
                    value={addTxId}
                    onChange={(e) => setAddTxId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none"
                  >
                    <option value="">선택</option>
                    {txList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {dayjs(t.date).format('MM.DD')} · {t.merchant_name || '(가맹점 미입력)'} · {formatAmount(t.amount)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-gray-500">수량 ({item.unit})</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={addQty}
                      onChange={(e) =>
                        setAddQty(
                          e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                        )
                      }
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500">총 가격</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={addPrice}
                      onChange={(e) => setAddPrice(e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none"
                    />
                  </div>
                </div>
                {addErr && <div className="text-[11px] text-red-500">{addErr}</div>}
                <div className="flex gap-2">
                  <button
                    onClick={saveAdd}
                    disabled={addSaving}
                    className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                  >
                    {addSaving ? '저장 중…' : '추가'}
                  </button>
                  <button
                    onClick={() => setAdding(false)}
                    disabled={addSaving}
                    className="px-3 py-1.5 border border-gray-200 text-gray-500 rounded-lg text-xs"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              {[...item.history].reverse().map((r, i) => (
                <div
                  key={r.id ?? i}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i < item.history.length - 1 ? 'border-b border-gray-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      {dayjs(r.date).format('YYYY.MM.DD (ddd)')}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {r.store}
                      {r.quantity > 1 ? ` · ${r.quantity}${r.unit || item.unit}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-sm font-bold ${
                        r.unit_price === item.minUnitPrice
                          ? 'text-emerald-600'
                          : 'text-gray-800'
                      }`}
                    >
                      {formatAmount(r.unit_price)}/{r.unit || item.unit}
                      {r.unit_price === item.minUnitPrice && ' 🏆'}
                    </p>
                    {r.quantity > 1 && (
                      <p className="text-xs text-gray-400">합계 {formatAmount(r.price)}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteRecord(r)}
                    disabled={deletingId === r.id || !r.id}
                    className="shrink-0 p-2 rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 active:bg-red-200 disabled:opacity-40"
                    title="이 구매 이력 삭제"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ItemTracker() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Item | null>(null);

  const loadItems = () => {
    setLoading(true);
    fetch('/api/items')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const filtered = search.trim()
    ? items.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        i.category.toLowerCase().includes(search.toLowerCase()) ||
        i.storeAvg.some((s) => s.store.toLowerCase().includes(search.toLowerCase()))
      )
    : items;

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 검색 */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="품목명, 매장명 검색..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-14 text-center px-6">
          <p className="text-4xl mb-3">🛒</p>
          <p className="text-sm font-medium text-gray-600">아직 추적된 품목이 없어요</p>
          <p className="text-xs text-gray-400 mt-1.5 leading-5">
            거래 입력 시 <span className="font-medium text-indigo-500">세부 품목</span>을 추가하면<br />
            품목별 단가를 추적하고 비교할 수 있어요
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-10 text-center">
          <p className="text-sm text-gray-400">검색 결과가 없어요</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400 px-1">{filtered.length}개 품목 추적 중</p>
          <div className="space-y-2">
            {filtered.map((item) => {
              const savingsPct = item.maxUnitPrice > 0
                ? Math.round(((item.maxUnitPrice - item.minUnitPrice) / item.maxUnitPrice) * 100)
                : 0;
              return (
                <button
                  key={item.name}
                  onClick={() => setSelected(item)}
                  className="w-full bg-white rounded-2xl border border-gray-100 px-4 py-3.5 text-left active:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 text-xl">
                      {CATEGORY_EMOJI[item.category] ?? '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                        {savingsPct >= 10 && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                            단가 최대 {savingsPct}% 차이
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {item.count}회 구매 · 평균 단가 {formatAmount(item.avgUnitPrice)}/{item.unit}
                        {item.avgGap && ` · ${item.avgGap}일 주기`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-emerald-600 font-medium">{formatAmount(item.minUnitPrice)}/{item.unit}</p>
                      <p className="text-[10px] text-gray-400">최저 단가</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected && (
        <ItemDetail
          item={selected}
          onClose={() => setSelected(null)}
          onRenamed={loadItems}
        />
      )}
    </div>
  );
}
