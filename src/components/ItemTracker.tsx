'use client';

import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Search, TrendingDown, Store, ChevronRight, X } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

interface StoreAvg { store: string; avg: number; count: number }
interface HistoryRecord {
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

function ItemDetail({ item, onClose }: { item: Item; onClose: () => void }) {
  const savings = item.maxUnitPrice - item.minUnitPrice;
  const savingsPct = item.maxUnitPrice > 0 ? Math.round((savings / item.maxUnitPrice) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <span>{CATEGORY_EMOJI[item.category] ?? '📦'}</span>
              {item.name}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{item.count}회 구매 · {item.category}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
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
            <p className="text-xs font-medium text-gray-500 mb-2">구매 이력</p>
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              {[...item.history].reverse().map((r, i) => (
                <div key={i} className={`flex items-center justify-between px-4 py-3 ${
                  i < item.history.length - 1 ? 'border-b border-gray-50' : ''
                }`}>
                  <div>
                    <p className="text-sm text-gray-700">{dayjs(r.date).format('YYYY.MM.DD (ddd)')}</p>
                    <p className="text-xs text-gray-400">{r.store}{r.quantity > 1 ? ` · ${r.quantity}개` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${r.unit_price === item.minUnitPrice ? 'text-emerald-600' : 'text-gray-800'}`}>
                      {formatAmount(r.unit_price)}/{r.unit || item.unit}
                      {r.unit_price === item.minUnitPrice && ' 🏆'}
                    </p>
                    {r.quantity > 1 && (
                      <p className="text-xs text-gray-400">합계 {formatAmount(r.price)}</p>
                    )}
                  </div>
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

  useEffect(() => {
    fetch('/api/items')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
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

      {selected && <ItemDetail item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
