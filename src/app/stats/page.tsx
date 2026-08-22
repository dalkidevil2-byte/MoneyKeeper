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
import type { Transaction } from '@/types';

dayjs.locale('ko');

type PeriodKey = 'month' | 'lastMonth' | '3month' | '6month' | 'custom';
type TypeFilter = 'all' | 'variable_expense' | 'fixed_expense';
/** 분석 축 — 무엇을 기준으로 쪼개 볼 것인가 */
type AxisKey = 'category' | 'card' | 'member';

const CATEGORY_COLORS: Record<string, string> = {
  '식비': '#f97316',
  '생활': '#22c55e',
  '교통': '#3b82f6',
  '의료': '#ef4444',
  '취미': '#14b8a6',
  '육아': '#f43f5e',
  '여행': '#0ea5e9',
  '출장': '#8b5cf6',
  '경조사·모임': '#ec4899',
  '고정비': '#64748b',
  '수입': '#10b981',
  '기타': '#94a3b8',
};

const CATEGORY_EMOJI: Record<string, string> = {
  '식비': '🍽️', '생활': '🧺', '교통': '🚌', '의료': '💊', '취미': '🎮',
  '육아': '👶', '여행': '✈️', '출장': '🧳', '경조사·모임': '🎁',
  '고정비': '🔒', '수입': '💰', '기타': '📝',
};

/** 카드처럼 이름이 정해져 있지 않은 축에 쓰는 색 팔레트 */
const PALETTE = ['#6366f1', '#f97316', '#14b8a6', '#ec4899', '#8b5cf6', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#64748b'];
const colorOf = (i: number) => PALETTE[i % PALETTE.length];

const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: '이번 달', value: 'month' },
  { label: '지난 달', value: 'lastMonth' },
  { label: '3개월', value: '3month' },
  { label: '6개월', value: '6month' },
  { label: '직접', value: 'custom' },
];

const AXES: { label: string; value: AxisKey }[] = [
  { label: '카테고리별', value: 'category' },
  { label: '카드별', value: 'card' },
  { label: '지출자별', value: 'member' },
];

const NO_CARD = '결제수단 미지정';
const SHARED_KEY = '__shared__';

function toMan(v: number) {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${(v / 10_000).toFixed(0)}만`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}천`;
  return `${v}`;
}

/** 지출 대상 목록 — 신규(target_member_ids) 우선, 없으면 구형(target_member_id) */
function targetIdsOf(t: Transaction): string[] {
  if (t.target_member_ids && t.target_member_ids.length > 0) return t.target_member_ids;
  return t.target_member_id ? [t.target_member_id] : [];
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs">
      {label && <p className="text-gray-400 mb-0.5">{label}</p>}
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
  const [cardFilter, setCardFilter] = useState<string>('all'); // 'all' | 카드 이름
  const [axis, setAxis] = useState<AxisKey>('category');
  const [drill, setDrill] = useState<{ axis: AxisKey; key: string } | null>(null);

  // 오늘을 문자열로 고정 — useMemo 의존성이 매 렌더 바뀌지 않도록
  const todayStr = dayjs().format('YYYY-MM-DD');

  // 직접 선택 기간 (기본: 이번 달 1일 ~ 오늘)
  const [customStart, setCustomStart] = useState(() => dayjs().startOf('month').format('YYYY-MM-DD'));
  const [customEnd, setCustomEnd] = useState(todayStr);

  // ── 기간 계산 ── 현재 기간 / 비교용 직전 동일 길이 기간
  const { startDate, endDate, prevStart, prevEnd, periodLabel } = useMemo(() => {
    const base = dayjs(todayStr);
    const monthRange = (start: dayjs.Dayjs, end: dayjs.Dayjs, months: number, label: string) => ({
      startDate: start.format('YYYY-MM-DD'),
      endDate: end.format('YYYY-MM-DD'),
      prevStart: start.subtract(months, 'month').format('YYYY-MM-DD'),
      prevEnd: start.subtract(1, 'day').format('YYYY-MM-DD'),
      periodLabel: label,
    });

    if (period === 'custom') {
      // 시작·종료가 뒤집혀 있어도 동작하도록 정렬
      const a = dayjs(customStart);
      const b = dayjs(customEnd);
      const s = a.isAfter(b) ? b : a;
      const e = a.isAfter(b) ? a : b;
      const days = e.diff(s, 'day') + 1;
      return {
        startDate: s.format('YYYY-MM-DD'),
        endDate: e.format('YYYY-MM-DD'),
        prevStart: s.subtract(days, 'day').format('YYYY-MM-DD'),
        prevEnd: s.subtract(1, 'day').format('YYYY-MM-DD'),
        periodLabel: `${s.format('M/D')}~${e.format('M/D')}`,
      };
    }
    if (period === 'lastMonth') {
      const m = base.subtract(1, 'month');
      return monthRange(m.startOf('month'), m.endOf('month'), 1, '지난 달');
    }
    const months = period === '3month' ? 3 : period === '6month' ? 6 : 1;
    return monthRange(
      base.subtract(months - 1, 'month').startOf('month'),
      base.endOf('month'),
      months,
      period === 'month' ? '이번 달' : `${months}개월`,
    );
  }, [period, customStart, customEnd, todayStr]);

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
    return (t: Transaction) => {
      if (!['variable_expense', 'fixed_expense'].includes(t.type)) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (cardFilter !== 'all' && (t.payment_method?.name || NO_CARD) !== cardFilter) return false;
      if (memberFilter !== 'all') {
        if (memberFilterMode === 'payer') {
          if (t.member_id !== memberFilter) return false;
        } else {
          if (!targetIdsOf(t).includes(memberFilter)) return false;
        }
      }
      return true;
    };
  }, [typeFilter, memberFilter, memberFilterMode, cardFilter]);

  const filtered = useMemo(() => transactions.filter(matchesFilters), [transactions, matchesFilters]);
  const prevFiltered = useMemo(() => prevTransactions.filter(matchesFilters), [prevTransactions, matchesFilters]);

  /** 지출자별 집계용 모집단 — 비중을 보려면 구성원 필터는 빼고 계산해야 한다 */
  const memberBase = useMemo(
    () =>
      transactions.filter(
        (t) =>
          ['variable_expense', 'fixed_expense'].includes(t.type) &&
          (typeFilter === 'all' || t.type === typeFilter) &&
          (cardFilter === 'all' || (t.payment_method?.name || NO_CARD) === cardFilter),
      ),
    [transactions, typeFilter, cardFilter],
  );

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

  // 직전 기간 대비 카테고리 증감
  const prevCategoryMap = useMemo(() => {
    const map: Record<string, number> = {};
    prevFiltered.forEach((t) => {
      const k = t.category_main || '기타';
      map[k] = (map[k] || 0) + t.amount;
    });
    return map;
  }, [prevFiltered]);

  // ── 카드(결제수단)별 ──
  const cardData = useMemo(() => {
    const map = new Map<string, { amount: number; count: number }>();
    filtered.forEach((t) => {
      const k = t.payment_method?.name || NO_CARD;
      const cur = map.get(k) ?? { amount: 0, count: 0 };
      map.set(k, { amount: cur.amount + t.amount, count: cur.count + 1 });
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, value: v.amount, count: v.count }))
      .sort((a, b) => b.value - a.value)
      .map((row, i) => ({ ...row, color: colorOf(i) })); // 금액 큰 순서대로 색 배정
  }, [filtered]);

  const prevCardMap = useMemo(() => {
    const map: Record<string, number> = {};
    prevFiltered.forEach((t) => {
      const k = t.payment_method?.name || NO_CARD;
      map[k] = (map[k] || 0) + t.amount;
    });
    return map;
  }, [prevFiltered]);

  // ── 지출자별 ──
  const memberData = useMemo(() => {
    const rows = members.map((m) => {
      let amount = 0;
      let count = 0;
      if (memberFilterMode === 'payer') {
        for (const t of memberBase) {
          if (t.member_id !== m.id) continue;
          amount += t.amount;
          count += 1;
        }
      } else {
        for (const t of memberBase) {
          const ids = targetIdsOf(t);
          if (ids.length === 0) continue; // 대상 미지정(우리가족)은 별도 집계
          if (ids.includes(m.id)) {
            amount += t.amount / ids.length; // 여러 명이면 나눠 담는다
            count += 1;
          }
        }
      }
      return { name: m.name, color: m.color, id: m.id, amount, count };
    });

    if (memberFilterMode === 'target') {
      const shared = memberBase.filter((t) => targetIdsOf(t).length === 0);
      const sharedAmount = shared.reduce((s, t) => s + t.amount, 0);
      if (sharedAmount > 0) {
        rows.push({ id: SHARED_KEY, name: '우리가족', color: '#64748b', amount: sharedAmount, count: shared.length });
      }
    }

    return rows.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [members, memberBase, memberFilterMode]);

  const totalMemberExpense = memberData.reduce((s, m) => s + m.amount, 0);

  // ── 현재 축의 목록 (한 가지 모양으로 통일해서 렌더) ──
  const axisRows = useMemo(() => {
    if (axis === 'category') {
      return categoryData.map((c) => {
        const prev = prevCategoryMap[c.name] ?? 0;
        return {
          key: c.name,
          label: `${CATEGORY_EMOJI[c.name] ?? '💰'} ${c.name}`,
          value: c.value,
          color: CATEGORY_COLORS[c.name] ?? '#94a3b8',
          delta: prev > 0 ? Math.round(((c.value - prev) / prev) * 100) : null,
          sub: null as string | null,
        };
      });
    }
    if (axis === 'card') {
      return cardData.map((c) => {
        const prev = prevCardMap[c.name] ?? 0;
        return {
          key: c.name,
          label: `💳 ${c.name}`,
          value: c.value,
          color: c.color,
          delta: prev > 0 ? Math.round(((c.value - prev) / prev) * 100) : null,
          sub: `${c.count}건`,
        };
      });
    }
    return memberData.map((m) => ({
      key: m.id,
      label: `${m.name === '우리가족' ? '🏠' : '🙋'} ${m.name}`,
      value: m.amount,
      color: m.color,
      delta: null as number | null,
      sub: `${m.count}건`,
    }));
  }, [axis, categoryData, prevCategoryMap, cardData, prevCardMap, memberData]);

  const axisTotal = axis === 'member' ? totalMemberExpense : totalExpense;

  // ── 드릴다운 ──
  const drillLabel = useMemo(() => {
    if (!drill) return '';
    if (drill.axis === 'member') return memberData.find((m) => m.id === drill.key)?.name ?? '';
    return drill.key;
  }, [drill, memberData]);

  const drillTxs = useMemo(() => {
    if (!drill) return [];
    const pool = drill.axis === 'member' ? memberBase : filtered;
    return pool
      .filter((t) => {
        if (drill.axis === 'category') return (t.category_main || '기타') === drill.key;
        if (drill.axis === 'card') return (t.payment_method?.name || NO_CARD) === drill.key;
        if (memberFilterMode === 'payer') return t.member_id === drill.key;
        const ids = targetIdsOf(t);
        return drill.key === SHARED_KEY ? ids.length === 0 : ids.includes(drill.key);
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [drill, filtered, memberBase, memberFilterMode]);

  const drillTotal = useMemo(() => {
    if (!drill) return 0;
    return axisRows.find((r) => r.key === drill.key)?.value ?? drillTxs.reduce((s, t) => s + t.amount, 0);
  }, [drill, axisRows, drillTxs]);

  /** 드릴다운 안의 2차 분해 — 카테고리는 세부항목, 카드·지출자는 카테고리로 쪼갠다 */
  const drillBreakdown = useMemo(() => {
    if (!drill) return [];
    const map: Record<string, number> = {};
    const add = (k: string, amt: number) => {
      const key = k || '기타';
      map[key] = (map[key] || 0) + amt;
    };

    drillTxs.forEach((t) => {
      const its = itemsByTx.get(t.id);
      if (drill.axis === 'category' && its && its.length > 0) {
        const sumItems = its.reduce((s, i) => s + (i.price || 0), 0);
        if (sumItems > 0) {
          for (const it of its) {
            if ((it.category_main || t.category_main) !== drill.key) continue;
            add(it.category_sub || t.category_sub, (t.amount * (it.price || 0)) / sumItems);
          }
          return;
        }
      }
      if (drill.axis === 'category') add(t.category_sub, t.amount);
      else add(t.category_main, t.amount);
    });

    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [drill, drillTxs, itemsByTx]);

  // ── 기간 추이 ── 선택한 기간을 통째로 쪼개서 보여준다 (31일 이하면 일별, 아니면 월별)
  const trend = useMemo(() => {
    const s = dayjs(startDate);
    const e = dayjs(endDate);
    const days = e.diff(s, 'day') + 1;
    const byDay = days <= 31;

    const buckets: { key: string; label: string; expense: number }[] = [];
    if (byDay) {
      for (let d = s; !d.isAfter(e); d = d.add(1, 'day')) {
        buckets.push({ key: d.format('YYYY-MM-DD'), label: d.format('D'), expense: 0 });
      }
    } else {
      for (let m = s.startOf('month'); !m.isAfter(e); m = m.add(1, 'month')) {
        buckets.push({ key: m.format('YYYY-MM'), label: m.format('M월'), expense: 0 });
      }
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    for (const t of filtered) {
      const k = byDay ? t.date.slice(0, 10) : t.date.slice(0, 7);
      const i = index.get(k);
      if (i !== undefined) buckets[i].expense += t.amount;
    }
    return { data: buckets, byDay };
  }, [filtered, startDate, endDate]);

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

  const activeFilters =
    (typeFilter !== 'all' ? 1 : 0) +
    (memberFilter !== 'all' ? 1 : 0) +
    (cardFilter !== 'all' ? 1 : 0) +
    (memberFilterMode !== 'payer' ? 1 : 0);

  const resetFilters = () => {
    setTypeFilter('all');
    setMemberFilter('all');
    setCardFilter('all');
    setMemberFilterMode('payer');
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 — 기간은 항상 노출 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-3 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">분석</h1>
          {activeFilters > 0 && (
            <button
              onClick={resetFilters}
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
              onClick={() => { setPeriod(p.value); setDrill(null); }}
              className={`flex-1 py-1.5 text-[11px] font-medium rounded-lg whitespace-nowrap transition-all ${
                period === p.value ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* 직접 기간 선택 */}
        {period === 'custom' && (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-gray-700"
            />
            <span className="text-gray-300 text-xs">~</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-2 py-1.5 text-xs text-gray-700"
            />
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {loading ? (
          <div className="py-20 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : drill ? (
          /* ── 드릴다운 ── */
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
              <button onClick={() => setDrill(null)} className="p-1.5 rounded-xl bg-gray-100 text-gray-600">
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-gray-800 truncate">
                {drill.axis === 'category'
                  ? `${CATEGORY_EMOJI[drill.key] ?? '💰'} ${drillLabel}`
                  : drill.axis === 'card'
                    ? `💳 ${drillLabel}`
                    : `🙋 ${drillLabel}`}
              </span>
              <span className="ml-auto text-sm font-bold text-rose-500 shrink-0">{formatAmount(drillTotal)}</span>
            </div>

            {drillBreakdown.length > 0 && (
              <div className="px-4 py-3 space-y-2 border-b border-gray-50">
                <p className="text-[11px] text-gray-400">
                  {drill.axis === 'category' ? '세부 항목' : '카테고리'}
                </p>
                {drillBreakdown.map((item, i) => {
                  const total = drillBreakdown.reduce((s, d) => s + d.value, 0);
                  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                  const barColor =
                    drill.axis === 'category'
                      ? CATEGORY_COLORS[drill.key] ?? '#94a3b8'
                      : CATEGORY_COLORS[item.name] ?? colorOf(i);
                  return (
                    <div key={item.name}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-600">{item.name || '기타'}</span>
                        <span className="font-medium text-gray-800">{formatAmount(item.value)} ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="divide-y divide-gray-50">
              {drillTxs.slice(0, 50).map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.name || t.merchant_name || '-'}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      {dayjs(t.date).format('M/D')}
                      {drill.axis !== 'category' && t.category_main && ` · ${t.category_main}`}
                      {drill.axis === 'category' && t.category_sub && ` · ${t.category_sub}`}
                      {drill.axis !== 'member' && t.member?.name && ` · ${t.member.name}`}
                      {drill.axis !== 'card' && t.payment_method?.name && ` · ${t.payment_method.name}`}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-rose-500 shrink-0 ml-2">-{formatAmount(t.amount)}</p>
                </div>
              ))}
              {drillTxs.length === 0 && <div className="py-8 text-center text-sm text-gray-400">내역이 없어요</div>}
              {drillTxs.length > 50 && (
                <div className="py-2 text-center text-[11px] text-gray-400">최근 50건만 표시</div>
              )}
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
                {cardFilter !== 'all' && <span className="ml-1 text-indigo-500">· {cardFilter}</span>}
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

              {totalBudget > 0 && period === 'month' && (
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

            {/* ── 2. 무엇을 기준으로 볼까 — 카테고리 / 카드 / 지출자 ── */}
            <section>
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-2">
                {AXES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => { setAxis(a.value); setDrill(null); }}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                      axis === a.value ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* 지출자별일 때만 결제자/지출대상 기준 선택 */}
              {axis === 'member' && members.length > 1 && (
                <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white mb-2">
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
              )}

              {axisRows.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  {axisRows.map((row) => {
                    const pct = axisTotal > 0 ? Math.round((row.value / axisTotal) * 100) : 0;
                    return (
                      <button
                        key={row.key}
                        onClick={() => setDrill({ axis, key: row.key })}
                        className="w-full text-left active:opacity-60"
                      >
                        <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
                          <span className="text-gray-700 truncate">
                            {row.label}
                            {row.delta !== null && Math.abs(row.delta) >= 20 && (
                              <span className={`ml-1.5 text-[11px] font-medium ${row.delta > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                                {row.delta > 0 ? '+' : ''}{row.delta}%
                              </span>
                            )}
                            {row.sub && <span className="ml-1.5 text-[11px] text-gray-300">{row.sub}</span>}
                          </span>
                          <span className="text-gray-800 font-medium text-xs shrink-0">
                            {formatAmount(row.value)} · {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: row.color }}
                          />
                        </div>
                      </button>
                    );
                  })}
                  <p className="text-[11px] text-gray-300 pt-1">탭하면 상세 내역</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 text-center text-gray-400 text-sm">
                  해당 조건의 지출 내역이 없어요
                </div>
              )}
            </section>

            {/* ── 3. 기간 추이 ── */}
            <div className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-semibold text-gray-800">{periodLabel} 지출 추이</h2>
                <span className="text-[11px] text-gray-400">{trend.byDay ? '일별' : '월별'}</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trend.data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    interval={trend.byDay ? Math.max(Math.floor(trend.data.length / 7), 0) : 0}
                  />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={toMan} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="expense" name="지출" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* ── 4. 자세히 보기 (접힘) ── */}
            <div>
              <button
                onClick={() => setShowDetail((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-3 text-sm text-gray-500 font-medium bg-white rounded-2xl border border-gray-100"
              >
                {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                자세히 보기
                <span className="text-xs text-gray-300">(필터 · 예산대비 · 품목추적)</span>
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

                    {/* 지출자 */}
                    {members.length > 1 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">
                          지출자 ({memberFilterMode === 'payer' ? '결제자' : '지출 대상'})
                        </p>
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

                    {/* 카드 — 이 기간에 실제로 쓴 카드만 나열 */}
                    {cardData.length > 1 && (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-gray-400">카드 · 결제수단</p>
                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                          <button
                            onClick={() => setCardFilter('all')}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                              cardFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            전체
                          </button>
                          {cardData.map((c) => (
                            <button
                              key={c.name}
                              onClick={() => setCardFilter(cardFilter === c.name ? 'all' : c.name)}
                              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                                cardFilter === c.name ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                              }`}
                              style={cardFilter === c.name ? { backgroundColor: c.color } : {}}
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 예산 vs 실제 */}
                  {budgetComparison.length > 0 && (
                    <div className="bg-white rounded-2xl p-4 border border-gray-100">
                      <h2 className="font-semibold text-gray-800 mb-3">예산 vs 실제</h2>
                      <div className="space-y-3.5">
                        {budgetComparison.map((item) => (
                          <button
                            key={item.name}
                            onClick={() => { setAxis('category'); setDrill({ axis: 'category', key: item.name }); }}
                            className="w-full text-left active:opacity-70"
                          >
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
