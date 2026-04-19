'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ChevronLeft } from 'lucide-react';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets, useMembers } from '@/hooks/useAccounts';
import { formatAmount } from '@/lib/parser';
import ItemTracker from '@/components/ItemTracker';

dayjs.locale('ko');

type PeriodKey = 'month' | '3month' | '6month';
type TypeFilter = 'all' | 'variable_expense' | 'fixed_expense';

const CATEGORY_COLORS: Record<string, string> = {
  '식비':      '#f97316',
  '카페':      '#a78bfa',
  '교통':      '#3b82f6',
  '쇼핑':      '#ec4899',
  '의료':      '#ef4444',
  '교육':      '#8b5cf6',
  '취미':      '#14b8a6',
  '고정비':    '#64748b',
  '생활':      '#22c55e',
  '주거':      '#f59e0b',
  '저축/투자': '#06b6d4',
  '육아':      '#f43f5e',
  '출장':      '#0ea5e9',
  '기타':      '#94a3b8',
};

const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: '이번 달', value: 'month' },
  { label: '3개월',   value: '3month' },
  { label: '6개월',   value: '6month' },
];

function toMan(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000)      return `${(v / 10_000).toFixed(0)}만`;
  if (v >= 1_000)       return `${(v / 1_000).toFixed(0)}천`;
  return `${v}`;
}

export default function StatsPage() {
  const [viewTab, setViewTab] = useState<'stats' | 'items'>('stats');
  const [period, setPeriod]           = useState<PeriodKey>('month');
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all'); // 'all' | memberId
  const [memberFilterMode, setMemberFilterMode] = useState<'payer' | 'target'>('payer'); // 결제자 | 지출 대상
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const today = dayjs();

  const { startDate, endDate } = useMemo(() => {
    const monthsBack = period === 'month' ? 0 : period === '3month' ? 2 : 5;
    return {
      startDate: today.subtract(monthsBack, 'month').startOf('month').format('YYYY-MM-DD'),
      endDate:   today.endOf('month').format('YYYY-MM-DD'),
    };
  }, [period]);

  const { transactions, loading } = useTransactions({ startDate, endDate });
  const { budgets } = useBudgets();
  const { members } = useMembers();

  // 거래 묶음의 세부 품목 일괄 조회
  type ItemAgg = {
    transaction_id: string;
    price: number;
    category_main: string;
    category_sub: string;
  };
  const [items, setItems] = useState<ItemAgg[]>([]);
  useEffect(() => {
    const ids = transactions.map((t) => t.id);
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    fetch('/api/items/by-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_ids: ids }),
    })
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, [transactions]);

  // transaction_id → items 그룹
  const itemsByTx = useMemo(() => {
    const map = new Map<string, ItemAgg[]>();
    for (const it of items) {
      const arr = map.get(it.transaction_id) ?? [];
      arr.push(it);
      map.set(it.transaction_id, arr);
    }
    return map;
  }, [items]);

  // ── 필터 적용 ──
  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      // 유형 필터
      if (typeFilter === 'variable_expense' && t.type !== 'variable_expense') return false;
      if (typeFilter === 'fixed_expense'    && t.type !== 'fixed_expense')    return false;
      if (typeFilter === 'all' && !['variable_expense', 'fixed_expense'].includes(t.type)) return false;

      // 구성원 필터
      if (memberFilter !== 'all') {
        if (memberFilterMode === 'payer') {
          if (t.member_id !== memberFilter) return false;
        } else {
          const ids =
            t.target_member_ids && t.target_member_ids.length > 0
              ? t.target_member_ids
              : t.target_member_id
                ? [t.target_member_id]
                : [];
          if (!ids.includes(memberFilter)) return false;
        }
      }

      return true;
    });
  }, [transactions, typeFilter, memberFilter, memberFilterMode]);

  const totalExpense = filtered.reduce((s, t) => s + t.amount, 0);
  const totalIncome  = transactions
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);

  // ── 카테고리별 ──
  // 카테고리 집계
  // - 세부 품목이 있으면 품목 기준으로 분배 (items.price 합산, 거래 amount는 items 합과 다를 수 있음 → 비율로 재정규화하여 거래 총액 보존)
  // - 세부 품목이 없으면 거래의 category_main으로 그대로 합산
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    const add = (cat: string, amt: number) => {
      const k = cat || '기타';
      map[k] = (map[k] || 0) + amt;
    };

    filtered.forEach((t) => {
      const its = itemsByTx.get(t.id);
      if (its && its.length > 0) {
        const sumItems = its.reduce((s, i) => s + (i.price || 0), 0);
        if (sumItems > 0) {
          // 거래 총액(t.amount)을 items 비율로 분배 (items.price 합 ≠ amount일 수도 있어 안전)
          for (const it of its) {
            const share = (t.amount * (it.price || 0)) / sumItems;
            add(it.category_main || t.category_main, share);
          }
          return;
        }
      }
      add(t.category_main, t.amount);
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, itemsByTx]);

  // ── 드릴다운: 선택된 카테고리의 소분류 ──
  const drilldownData = useMemo(() => {
    if (!selectedCategory) return [];
    const map: Record<string, number> = {};
    const add = (sub: string, amt: number) => {
      const k = sub || '기타';
      map[k] = (map[k] || 0) + amt;
    };

    filtered.forEach((t) => {
      const its = itemsByTx.get(t.id);
      if (its && its.length > 0) {
        const sumItems = its.reduce((s, i) => s + (i.price || 0), 0);
        if (sumItems > 0) {
          for (const it of its) {
            const main = it.category_main || t.category_main;
            if (main !== selectedCategory) continue;
            const share = (t.amount * (it.price || 0)) / sumItems;
            add(it.category_sub || t.category_sub, share);
          }
          return;
        }
      }
      // items 없는 거래
      if ((t.category_main || '기타') === selectedCategory) {
        add(t.category_sub, t.amount);
      }
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filtered, itemsByTx, selectedCategory]);

  const drilldownTxs = useMemo(() => {
    if (!selectedCategory) return [];
    return filtered
      .filter((t) => (t.category_main || '기타') === selectedCategory)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [filtered, selectedCategory]);

  // ── 월별 추이 ──
  const monthlyData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = today.subtract(i, 'month');
      const prefix = m.format('YYYY-MM');
      const txMonth = transactions.filter((t) => t.date.startsWith(prefix));

      let expense = txMonth.filter((t) => {
        if (!['variable_expense', 'fixed_expense'].includes(t.type)) return false;
        if (typeFilter === 'variable_expense' && t.type !== 'variable_expense') return false;
        if (typeFilter === 'fixed_expense'    && t.type !== 'fixed_expense')    return false;
        if (memberFilter !== 'all') {
          if (memberFilterMode === 'payer') {
            if (t.member_id !== memberFilter) return false;
          } else {
            const ids =
              t.target_member_ids && t.target_member_ids.length > 0
                ? t.target_member_ids
                : t.target_member_id
                  ? [t.target_member_id]
                  : [];
            if (!ids.includes(memberFilter)) return false;
          }
        }
        return true;
      }).reduce((s, t) => s + t.amount, 0);

      months.push({ month: m.format('M월'), expense });
    }
    return months;
  }, [transactions, typeFilter, memberFilter]);

  // ── 예산 vs 실제 ──
  const budgetComparison = useMemo(() => {
    return budgets
      .filter((b) => !b.is_total && b.category_main)
      .map((b) => {
        const actual = filtered
          .filter((t) => t.category_main === b.category_main)
          .reduce((s, t) => s + t.amount, 0);
        return {
          name:   b.category_main as string,
          budget: b.amount as number,
          actual,
          rate:   b.amount > 0 ? Math.round((actual / b.amount) * 100) : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [budgets, filtered]);

  // ── 구성원별 ──
  // payer: member_id 단일
  // target: target_member_ids 우선, 없으면 target_member_id.
  //   - 비어있음 → '공용' 슬라이스로 별도 집계
  //   - 여러 명이면 N등분
  const memberData = useMemo(() => {
    if (members.length < 2) return [];
    const base = transactions.filter((t) =>
      ['variable_expense', 'fixed_expense'].includes(t.type)
    );

    const rows = members.map((m) => {
      let amount = 0;
      if (memberFilterMode === 'payer') {
        amount = base
          .filter((t) => t.member_id === m.id)
          .reduce((s, t) => s + t.amount, 0);
      } else {
        for (const t of base) {
          const ids =
            t.target_member_ids && t.target_member_ids.length > 0
              ? t.target_member_ids
              : t.target_member_id
                ? [t.target_member_id]
                : [];
          if (ids.length === 0) continue; // 공용은 별도 집계
          if (ids.includes(m.id)) {
            amount += t.amount / ids.length;
          }
        }
      }
      return { name: m.name, color: m.color, id: m.id, amount };
    });

    // 지출 대상 모드일 때만 '공용' 슬라이스 추가
    if (memberFilterMode === 'target') {
      const sharedAmount = base
        .filter((t) => {
          const ids =
            t.target_member_ids && t.target_member_ids.length > 0
              ? t.target_member_ids
              : t.target_member_id
                ? [t.target_member_id]
                : [];
          return ids.length === 0;
        })
        .reduce((s, t) => s + t.amount, 0);
      if (sharedAmount > 0) {
        rows.push({
          id: '__shared__',
          name: '공용',
          color: '#64748b', // slate-500
          amount: sharedAmount,
        });
      }
    }

    return rows.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [members, transactions, memberFilterMode]);

  const totalMemberExpense = memberData.reduce((s, m) => s + m.amount, 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.fill ?? p.color }}>{p.name}: {formatAmount(p.value)}</p>
        ))}
      </div>
    );
  };

  // 활성 필터 개수 (배지용)
  const activeFilters = (typeFilter !== 'all' ? 1 : 0) + (memberFilter !== 'all' ? 1 : 0) + (memberFilterMode !== 'payer' ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-3 sticky top-0 z-10">
        {/* 뷰 탭 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          <button
            onClick={() => setViewTab('stats')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${viewTab === 'stats' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
          >
            📊 지출 통계
          </button>
          <button
            onClick={() => setViewTab('items')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${viewTab === 'items' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
          >
            🛒 품목 추적
          </button>
        </div>

        {/* 지출 통계 탭 필터들 */}
        {viewTab === 'stats' && <>
        {/* 제목 + 기간 탭 */}
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">지출 통계</h1>
          {activeFilters > 0 && (
            <span className="text-xs bg-indigo-100 text-indigo-600 font-semibold px-2 py-0.5 rounded-full">
              필터 {activeFilters}개 적용
            </span>
          )}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                period === p.value ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 유형 필터 */}
        <div className="flex gap-1.5 mb-2">
          {[
            { label: '전체 지출', value: 'all' as TypeFilter },
            { label: '변동지출',  value: 'variable_expense' as TypeFilter },
            { label: '고정지출',  value: 'fixed_expense' as TypeFilter },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                typeFilter === f.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 구성원 필터 */}
        {members.length > 1 && (
          <div className="space-y-2">
            {/* 결제자 / 지출 대상 토글 */}
            <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white">
              <button
                onClick={() => { setMemberFilterMode('payer'); setMemberFilter('all'); }}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${memberFilterMode === 'payer' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
              >
                💳 결제자 기준
              </button>
              <button
                onClick={() => { setMemberFilterMode('target'); setMemberFilter('all'); }}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors ${memberFilterMode === 'target' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}
              >
                🎯 지출 대상 기준
              </button>
            </div>
            {/* 구성원 선택 */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setMemberFilter('all')}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  memberFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                전체
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMemberFilter(memberFilter === m.id ? 'all' : m.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                    memberFilter === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                  }`}
                  style={memberFilter === m.id ? { backgroundColor: m.color } : {}}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}
        </>}
      </div>

      <div className="px-4 py-4 space-y-4">
        {viewTab === 'items' ? (
          <ItemTracker />
        ) : loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">
                  {typeFilter === 'fixed_expense' ? '고정지출' : typeFilter === 'variable_expense' ? '변동지출' : '총 지출'}
                </p>
                <p className="text-xl font-bold text-rose-500">{formatAmount(totalExpense)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{filtered.length}건</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-gray-100">
                <p className="text-xs text-gray-400 mb-1">총 수입</p>
                <p className="text-xl font-bold text-emerald-500">{formatAmount(totalIncome)}</p>
                <p className={`text-xs mt-0.5 font-medium ${totalIncome - totalExpense >= 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                  {totalIncome - totalExpense >= 0 ? `+${formatAmount(totalIncome - totalExpense)} 잉여` : `-${formatAmount(totalExpense - totalIncome)} 적자`}
                </p>
              </div>
            </div>

            {/* 카테고리 드릴다운 뷰 */}
            {selectedCategory ? (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* 드릴다운 헤더 */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="p-1.5 rounded-xl bg-gray-100 text-gray-600"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-gray-800">
                    {selectedCategory} 상세
                  </span>
                  <span className="ml-auto text-sm font-bold text-rose-500">
                    {formatAmount(categoryData.find((c) => c.name === selectedCategory)?.value ?? 0)}
                  </span>
                </div>

                {/* 소분류 바 */}
                {drilldownData.length > 0 && (
                  <div className="px-4 py-3 space-y-2 border-b border-gray-50">
                    {drilldownData.map((item) => {
                      const total = drilldownData.reduce((s, d) => s + d.value, 0);
                      const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                      return (
                        <div key={item.name}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-600">{item.name}</span>
                            <span className="font-medium text-gray-800">{formatAmount(item.value)} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[selectedCategory] ?? '#94a3b8' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 해당 카테고리 거래 목록 */}
                <div className="divide-y divide-gray-50">
                  {drilldownTxs.slice(0, 20).map((t) => (
                    <div key={t.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.merchant_name || t.name || '-'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {dayjs(t.date).format('M/D')}
                          {t.category_sub && ` · ${t.category_sub}`}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-rose-500">-{formatAmount(t.amount)}</p>
                    </div>
                  ))}
                  {drilldownTxs.length === 0 && (
                    <div className="py-8 text-center text-sm text-gray-400">내역이 없어요</div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* 카테고리별 도넛 차트 */}
                {categoryData.length > 0 ? (
                  <div className="bg-white rounded-2xl p-4 border border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-1">카테고리별 지출</h2>
                    <p className="text-xs text-gray-400 mb-3">탭하면 상세 내역을 볼 수 있어요</p>
                    <div className="flex items-center gap-2">
                      <PieChart width={150} height={150}>
                        <Pie
                          data={categoryData}
                          cx={70} cy={70}
                          innerRadius={42} outerRadius={68}
                          dataKey="value"
                          paddingAngle={2}
                          onClick={(d) => setSelectedCategory(d.name ?? null)}
                          className="cursor-pointer"
                        >
                          {categoryData.map((entry, i) => (
                            <Cell key={i} fill={CATEGORY_COLORS[entry.name] ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                      <div className="flex-1 space-y-1.5 min-w-0">
                        {categoryData.slice(0, 7).map((item) => (
                          <button
                            key={item.name}
                            onClick={() => setSelectedCategory(item.name)}
                            className="w-full flex items-center justify-between gap-2 active:opacity-70"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: CATEGORY_COLORS[item.name] ?? '#94a3b8' }}
                              />
                              <span className="text-xs text-gray-600 truncate">{item.name}</span>
                            </div>
                            <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                              {toMan(item.value)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 퍼센트 바 */}
                    <div className="mt-3 space-y-2">
                      {categoryData.map((item) => {
                        const pct = totalExpense > 0 ? Math.round((item.value / totalExpense) * 100) : 0;
                        return (
                          <button
                            key={item.name}
                            onClick={() => setSelectedCategory(item.name)}
                            className="w-full text-left active:opacity-70"
                          >
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-500">{item.name}</span>
                              <span className="text-gray-700 font-medium">{formatAmount(item.value)} · {pct}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[item.name] ?? '#94a3b8' }}
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400 text-sm">
                    해당 조건의 지출 내역이 없어요
                  </div>
                )}

                {/* 구성원별 지출 도넛 */}
                {memberData.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-gray-100">
                    <div className="flex items-baseline justify-between mb-1">
                      <h2 className="font-semibold text-gray-800">구성원별 지출</h2>
                      <span className="text-[11px] text-gray-400">
                        {memberFilterMode === 'payer' ? '결제자 기준' : '지출 대상 기준'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">상단 필터에서 결제자/지출 대상 전환 가능</p>
                    <div className="flex items-center gap-2">
                      <PieChart width={150} height={150}>
                        <Pie
                          data={memberData}
                          cx={70}
                          cy={70}
                          innerRadius={42}
                          outerRadius={68}
                          dataKey="amount"
                          paddingAngle={2}
                        >
                          {memberData.map((entry, i) => (
                            <Cell key={i} fill={entry.color ?? '#94a3b8'} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </PieChart>
                      <div className="flex-1 space-y-1.5 min-w-0">
                        {memberData.map((m) => {
                          const pct =
                            totalMemberExpense > 0
                              ? Math.round((m.amount / totalMemberExpense) * 100)
                              : 0;
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: m.color ?? '#94a3b8' }}
                                />
                                <span className="text-xs text-gray-600 truncate">{m.name}</span>
                              </div>
                              <span className="text-xs font-semibold text-gray-800 flex-shrink-0">
                                {toMan(m.amount)} · {pct}%
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* 월별 추이 */}
                <div className="bg-white rounded-2xl p-4 border border-gray-100">
                  <h2 className="font-semibold text-gray-800 mb-3">월별 지출 추이</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={toMan} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="expense" name="지출" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* 예산 vs 실제 */}
                {budgetComparison.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-3">예산 vs 실제</h2>
                    <div className="space-y-3.5">
                      {budgetComparison.map((item) => (
                        <button
                          key={item.name}
                          onClick={() => setSelectedCategory(item.name)}
                          className="w-full text-left active:opacity-70"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm text-gray-700">{item.name}</span>
                              {item.rate >= 100 && <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full font-medium">초과</span>}
                              {item.rate >= 80 && item.rate < 100 && <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">주의</span>}
                            </div>
                            <span className={`text-xs font-semibold ${item.rate >= 100 ? 'text-rose-500' : 'text-gray-600'}`}>{item.rate}%</span>
                          </div>
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${item.rate >= 100 ? 'bg-rose-500' : item.rate >= 80 ? 'bg-amber-400' : 'bg-indigo-500'}`}
                              style={{ width: `${Math.min(item.rate, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                            <span>{formatAmount(item.actual)} 사용</span>
                            <span>예산 {formatAmount(item.budget)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 구성원별 지출 */}
                {memberData.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-gray-100">
                    <h2 className="font-semibold text-gray-800 mb-3">구성원별 지출</h2>
                    <div className="space-y-3">
                      {memberData.map((m) => {
                        const pct = totalMemberExpense > 0 ? Math.round((m.amount / totalMemberExpense) * 100) : 0;
                        const isActive = memberFilter === m.id;
                        return (
                          <button
                            key={m.name}
                            onClick={() => setMemberFilter(memberFilter === m.id ? 'all' : m.id)}
                            className={`w-full text-left rounded-xl transition-all ${isActive ? 'ring-2 ring-offset-1 ring-indigo-400' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                  style={{ backgroundColor: m.color }}
                                >
                                  {m.name === '함께' ? '🫂' : m.name.slice(0, 1)}
                                </span>
                                <span className="text-sm text-gray-700 font-medium">{m.name}</span>
                                {isActive && <span className="text-xs text-indigo-500 font-medium">필터 적용 중</span>}
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-semibold text-gray-800">{formatAmount(m.amount)}</span>
                                <span className="text-xs text-gray-400 ml-1">({pct}%)</span>
                              </div>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: m.color }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {memberFilter !== 'all' && (
                      <button
                        onClick={() => setMemberFilter('all')}
                        className="w-full mt-3 py-2 text-xs text-gray-500 bg-gray-50 rounded-xl"
                      >
                        필터 해제
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
