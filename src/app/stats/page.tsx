'use client';

import { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ChevronLeft, ChevronDown, ChevronUp, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets, useMembers } from '@/hooks/useAccounts';
import { formatAmount } from '@/lib/parser';
import ItemTracker from '@/components/ItemTracker';
import InsightCard from '@/components/InsightCard';

dayjs.locale('ko');

type PeriodKey = 'month' | '3month' | '6month';
type TypeFilter = 'all' | 'variable_expense' | 'fixed_expense';

const CATEGORY_COLORS: Record<string, string> = {
  '식비': '#f97316',
  '카페': '#a78bfa',
  '교통': '#3b82f6',
  '쇼핑': '#ec4899',
  '의료': '#ef4444',
  '교육': '#8b5cf6',
  '취미': '#14b8a6',
  '고정비': '#64748b',
  '생활': '#22c55e',
  '주거': '#f59e0b',
  '저축/투자': '#06b6d4',
  '육아': '#f43f5e',
  '출장': '#0ea5e9',
  '기타': '#94a3b8',
};

const CATEGORY_EMOJI: Record<string, string> = {
  '식비': '🍽️', '카페': '☕', '교통': '🚌', '쇼핑': '🛍️', '의료': '💊',
  '교육': '📚', '취미': '🎮', '고정비': '🔒', '생활': '🧺',
  '주거': '🏠', '저축/투자': '📈', '육아': '👶', '출장': '✈️', '기타': '📝',
};

const PERIODS: { label: string; value: PeriodKey; months: number }[] = [
  { label: '이번 달', value: 'month', months: 1 },
  { label: '3개월', value: '3month', months: 3 },
  { label: '6개월', value: '6month', months: 6 },
];

function toMan(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}천`;
  return `${v}`;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.fill ?? p.color }}>{p.name}: {formatAmount(p.value)}</p>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [showDetail, setShowDetail] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [memberFilter, setMemberFilter] = useState<string>('all'); // 'all' | memberId
  const [memberFilterMode, setMemberFilterMode] = useState<'payer' | 'target'>('payer');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // 오늘을 문자열로 고정 — useMemo 의존성이 매 렌더 바뀌지 않도록
  const todayStr = dayjs().format('YYYY-MM-DD');
  const monthsBack = PERIODS.find((p) => p.value === period)!.months;

  // 현재 기간 / 직전 동일 길이 기간
  const { startDate, endDate, prevStart, prevEnd } = useMemo(() => {
    const base = dayjs(todayStr);
    const start = base.subtract(monthsBack - 1, 'month').startOf('month');
    const end = base.endOf('month');
    return {
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      prevStart: start.subtract(monthsBack, 'month').format('YYYY-MM-DD'),
      prevEnd: start.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
    };
  }, [monthsBack, todayStr]);

  const { transactions, loading } = useTransactions({ startDate, endDate });
  const { transactions: prevTransactions } = useTransactions({ startDate: prevStart, endDate: prevEnd });
  const { budgets } = useBudgets();
  const { members } = useMembers();

  // 거래 묶음의 세부 품목 일괄 조회 (카테고리 분배용)
  type ItemAgg = { transaction_id: string; price: number; category_main: string; category_sub: string };
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

  const itemsByTx = useMemo(() => {
    const map = new Map<string, ItemAgg[]>();
    for (const it of items) {
      const arr = map.get(it.transaction_id) ?? [];
      arr.push(it);
      map.set(it.transaction_id, arr);
    }
    return map;
  }, [items]);

  // ── 공통 필터 ──
  const matchesFilters = useMemo(() => {
    return (t: (typeof transactions)[number]) => {
      if (!['variable_expense', 'fixed_expense'].includes(t.type)) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
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
    };
  }, [typeFilter, memberFilter, memberFilterMode]);

  const filtered = useMemo(() => transactions.filter(matchesFilters), [transactions, matchesFilters]);
  const prevFiltered = useMemo(() => prevTransactions.filter(matchesFilters), [prevTransactions, matchesFilters]);

  const totalExpense = filtered.reduce((s, t) => s + t.amount, 0);
  const prevExpense = prevFiltered.reduce((s, t) => s + t.amount, 0);
  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const diffPct = prevExpense > 0 ? Math.round(((totalExpense - prevExpense) / prevExpense) * 100) : null;

  // ── 예산 사용률 + 소비 속도 (이번 달에만 의미 있음) ──
  const totalBudget = budgets.find((b) => b.is_total)?.amount ?? 0;
  const budgetRate = totalBudget > 0 ? Math.round((totalExpense / totalBudget) * 100) : 0;
  const budgetRemaining = totalBudget - totalExpense;

  const pace = useMemo(() => {
    if (period !== 'month' || totalBudget <= 0 || totalExpense <= 0) return null;
    const base = dayjs(todayStr);
    const dayOfMonth = base.date();
    const daysInMonth = base.daysInMonth();
    const daysLeft = daysInMonth - dayOfMonth;
    const projected = Math.round((totalExpense / dayOfMonth) * daysInMonth);
    return { daysLeft, projected, over: projected - totalBudget };
  }, [period, totalBudget, totalExpense, todayStr]);

  // ── 카테고리별 (세부 품목 있으면 품목 비율로 분배) ──
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
          // 거래 총액을 품목 비율로 분배 (품목 합 ≠ 거래액인 경우도 총액 보존)
          for (const it of its) {
            add(it.category_main || t.category_main, (t.amount * (it.price || 0)) / sumItems);
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

  // 전월 대비 카테고리 증감 (이번 달일 때만)
  const prevCategoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    prevFiltered.forEach((t) => {
      const k = t.category_main || '기타';
      map[k] = (map[k] || 0) + t.amount;
    });
    return map;
  }, [prevFiltered]);

  // ── 드릴다운 ──
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
            add(it.category_sub || t.category_sub, (t.amount * (it.price || 0)) / sumItems);
          }
          return;
        }
      }
      if ((t.category_main || '기타') === selectedCategory) add(t.category_sub, t.amount);
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

  // ── 월별 추이 (최근 6개월) ──
  const monthlyData = useMemo(() => {
    const base = dayjs(todayStr);
    const pool = [...transactions, ...prevTransactions];
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = base.subtract(i, 'month');
      const prefix = m.format('YYYY-MM');
      const expense = pool
        .filter((t) => t.date.startsWith(prefix) && matchesFilters(t))
        .reduce((s, t) => s + t.amount, 0);
      months.push({ month: m.format('M월'), expense });
    }
    return months;
  }, [transactions, prevTransactions, matchesFilters, todayStr]);

  // ── 예산 vs 실제 ──
  const budgetComparison = useMemo(() => {
    return budgets
      .filter((b) => !b.is_total && b.category_main)
      .map((b) => {
        const actual = categoryData.find((c) => c.name === b.category_main)?.value ?? 0;
        return {
          name: b.category_main as string,
          budget: b.amount as number,
          actual,
          rate: b.amount > 0 ? Math.round((actual / b.amount) * 100) : 0,
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [budgets, categoryData]);

  // ── 구성원별 ──
  const memberData = useMemo(() => {
    if (members.length < 2) return [];
    const base = transactions.filter((t) => ['variable_expense', 'fixed_expense'].includes(t.type));

    const rows = members.map((m) => {
      let amount = 0;
      if (memberFilterMode === 'payer') {
        amount = base.filter((t) => t.member_id === m.id).reduce((s, t) => s + t.amount, 0);
      } else {
        for (const t of base) {
          const ids =
            t.target_member_ids && t.target_member_ids.length > 0
              ? t.target_member_ids
              : t.target_member_id
                ? [t.target_member_id]
                : [];
          if (ids.length === 0) continue; // 공용은 별도 집계
          if (ids.includes(m.id)) amount += t.amount / ids.length;
        }
      }
      return { name: m.name, color: m.color, id: m.id, amount };
    });

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
      if (sharedAmount > 0) rows.push({ id: '__shared__', name: '공용', color: '#64748b', amount: sharedAmount });
    }

    return rows.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [members, transactions, memberFilterMode]);

  const totalMemberExpense = memberData.reduce((s, m) => s + m.amount, 0);

  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) + (memberFilter !== 'all' ? 1 : 0) + (memberFilterMode !== 'payer' ? 1 : 0);
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 — 기간만 항상 노출 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">분석</h1>
          {activeFilters > 0 && (
            <button
              onClick={() => { setTypeFilter('all'); setMemberFilter('all'); setMemberFilterMode('payer'); }}
              className="text-xs bg-indigo-100 text-indigo-600 font-semibold px-2 py-0.5 rounded-full"
            >
              필터 {activeFilters}개 · 해제
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setPeriod(p.value); setSelectedCategory(null); }}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                period === p.value ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : selectedCategory ? (
          /* ── 카테고리 드릴다운 ── */
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
              <button onClick={() => setSelectedCategory(null)} className="p-1.5 rounded-xl bg-gray-100 text-gray-600">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {CATEGORY_EMOJI[selectedCategory] ?? '💰'} {selectedCategory}
              </span>
              <span className="ml-auto text-sm font-bold text-rose-500">
                {formatAmount(categoryData.find((c) => c.name === selectedCategory)?.value ?? 0)}
              </span>
            </div>

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

            <div className="divide-y divide-gray-50">
              {drilldownTxs.slice(0, 30).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.name || t.merchant_name || '-'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {dayjs(t.date).format('M/D')}
                      {t.category_sub && ` · ${t.category_sub}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-rose-500">-{formatAmount(t.amount)}</p>
                </div>
              ))}
              {drilldownTxs.length === 0 && <div className="py-8 text-center text-sm text-gray-400">내역이 없어요</div>}
            </div>
          </div>
        ) : (
          <>
            {/* ── 1. 한 장 요약 ── */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-sm text-gray-500">
                {periodLabel} 지출
                {memberFilter !== 'all' && (
                  <span className="ml-1 text-indigo-500">
                    · {members.find((m) => m.id === memberFilter)?.name}
                  </span>
                )}
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-bold text-gray-900">{formatAmount(totalExpense)}</span>
                {diffPct !== null && (
                  <span className={`text-sm font-medium flex items-center gap-0.5 ${diffPct > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                    {diffPct > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {diffPct > 0 ? '+' : ''}{diffPct}%
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {filtered.length}건 · 수입 {formatAmount(totalIncome)}
                <span className={`ml-1.5 font-medium ${totalIncome - totalExpense >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                  {totalIncome - totalExpense >= 0
                    ? `잉여 ${formatAmount(totalIncome - totalExpense)}`
                    : `적자 ${formatAmount(totalExpense - totalIncome)}`}
                </span>
              </p>

              {totalBudget > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-gray-500">예산 사용률</span>
                    <span className={`font-semibold ${budgetRate >= 100 ? 'text-rose-500' : budgetRate >= 80 ? 'text-amber-500' : 'text-gray-700'}`}>
                      {budgetRate}% · {budgetRemaining >= 0 ? `남은 ${formatAmount(budgetRemaining)}` : `${formatAmount(-budgetRemaining)} 초과`}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        budgetRate >= 100 ? 'bg-rose-400' : budgetRate >= 90 ? 'bg-orange-400' : budgetRate >= 80 ? 'bg-amber-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(budgetRate, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 소비 속도 경고 */}
              {pace && (
                <div
                  className={`mt-3 rounded-xl px-3 py-2.5 flex items-start gap-2 ${
                    pace.over > 0 ? 'bg-rose-50' : 'bg-emerald-50'
                  }`}
                >
                  <AlertTriangle size={15} className={pace.over > 0 ? 'text-rose-500 mt-0.5 shrink-0' : 'text-emerald-600 mt-0.5 shrink-0'} />
                  <p className={`text-xs leading-5 ${pace.over > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {pace.over > 0 ? (
                      <>이 속도면 월말에 <b>{formatAmount(pace.over)} 초과</b> 예상이에요 (예상 {formatAmount(pace.projected)})</>
                    ) : (
                      <>지금 속도면 예산 안에서 끝나요 (월말 예상 {formatAmount(pace.projected)})</>
                    )}
                    <span className="text-gray-400"> · {pace.daysLeft}일 남음</span>
                  </p>
                </div>
              )}
            </div>

            {/* ── 2. 어디에 썼나 ── */}
            <section>
              <div className="flex items-baseline justify-between mb-2 px-1">
                <h2 className="font-semibold text-gray-800">어디에 썼나</h2>
                <span className="text-xs text-gray-400">탭하면 상세</span>
              </div>
              {categoryData.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  {categoryData.map((item) => {
                    const pct = totalExpense > 0 ? Math.round((item.value / totalExpense) * 100) : 0;
                    const prev = prevCategoryMap[item.name] ?? 0;
                    const delta = prev > 0 ? Math.round(((item.value - prev) / prev) * 100) : null;
                    return (
                      <button
                        key={item.name}
                        onClick={() => setSelectedCategory(item.name)}
                        className="w-full text-left active:opacity-60"
                      >
                        <div className="flex justify-between items-baseline text-sm mb-1">
                          <span className="text-gray-700">
                            {CATEGORY_EMOJI[item.name] ?? '💰'} {item.name}
                            {delta !== null && Math.abs(delta) >= 20 && (
                              <span className={`ml-1.5 text-[11px] font-medium ${delta > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {delta > 0 ? '+' : ''}{delta}%
                              </span>
                            )}
                          </span>
                          <span className="text-gray-800 font-medium text-xs">
                            {formatAmount(item.value)} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: CATEGORY_COLORS[item.name] ?? '#94a3b8' }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400 text-sm">
                  해당 조건의 지출 내역이 없어요
                </div>
              )}
            </section>

            {/* ── 3. 눈에 띄는 것 ── */}
            <InsightCard title="눈에 띄는 것" />

            {/* ── 4. 자세히 보기 (접힘) ── */}
            <div>
              <button
                onClick={() => setShowDetail((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-3 text-sm text-gray-500 font-medium bg-white rounded-2xl border border-gray-100"
              >
                {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                자세히 보기
                <span className="text-xs text-gray-300">(필터 · 월별추이 · 예산대비 · 구성원별 · 품목추적)</span>
              </button>

              {showDetail && (
                <div className="space-y-4 mt-4">
                  {/* 필터 */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500">필터</p>
                    <div className="flex gap-1.5">
                      {[
                        { label: '전체 지출', value: 'all' as TypeFilter },
                        { label: '변동지출', value: 'variable_expense' as TypeFilter },
                        { label: '고정지출', value: 'fixed_expense' as TypeFilter },
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

                    {members.length > 1 && (
                      <div className="space-y-2">
                        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white">
                          <button
                            onClick={() => { setMemberFilterMode('payer'); setMemberFilter('all'); }}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                              memberFilterMode === 'payer' ? 'bg-indigo-600 text-white' : 'text-gray-500'
                            }`}
                          >
                            💳 결제자 기준
                          </button>
                          <button
                            onClick={() => { setMemberFilterMode('target'); setMemberFilter('all'); }}
                            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                              memberFilterMode === 'target' ? 'bg-indigo-600 text-white' : 'text-gray-500'
                            }`}
                          >
                            🎯 지출 대상 기준
                          </button>
                        </div>
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
                  </div>

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
                          <button key={item.name} onClick={() => setSelectedCategory(item.name)} className="w-full text-left active:opacity-70">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm text-gray-700">{item.name}</span>
                                {item.rate >= 100 && (
                                  <span className="text-xs bg-rose-100 text-rose-500 px-1.5 py-0.5 rounded-full font-medium">초과</span>
                                )}
                                {item.rate >= 80 && item.rate < 100 && (
                                  <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-medium">주의</span>
                                )}
                              </div>
                              <span className={`text-xs font-semibold ${item.rate >= 100 ? 'text-rose-500' : 'text-gray-600'}`}>
                                {item.rate}%
                              </span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  item.rate >= 100 ? 'bg-rose-500' : item.rate >= 80 ? 'bg-amber-400' : 'bg-indigo-500'
                                }`}
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
                      <div className="flex items-baseline justify-between mb-3">
                        <h2 className="font-semibold text-gray-800">구성원별 지출</h2>
                        <span className="text-[11px] text-gray-400">
                          {memberFilterMode === 'payer' ? '결제자 기준' : '지출 대상 기준'}
                        </span>
                      </div>
                      <div className="space-y-3">
                        {memberData.map((m) => {
                          const pct = totalMemberExpense > 0 ? Math.round((m.amount / totalMemberExpense) * 100) : 0;
                          const isActive = memberFilter === m.id;
                          return (
                            <button
                              key={m.id}
                              onClick={() => setMemberFilter(memberFilter === m.id ? 'all' : m.id)}
                              className={`w-full text-left rounded-xl transition-all ${isActive ? 'ring-2 ring-offset-1 ring-indigo-400' : ''}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                                    style={{ backgroundColor: m.color }}
                                  >
                                    {m.name === '공용' ? '🏠' : m.name.slice(0, 1)}
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
                    </div>
                  )}

                  {/* 품목 추적 */}
                  <div>
                    <h2 className="font-semibold text-gray-800 mb-2 px-1">🛒 품목 추적</h2>
                    <ItemTracker />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
