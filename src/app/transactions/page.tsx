'use client';

import { useState, useMemo } from 'react';
import { Plus, Search, X, CalendarDays, List } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';

import TransactionCard from '@/components/transaction/TransactionCard';
import TransactionInputModal from '@/components/transaction/TransactionInputModal';
import TransactionEditModal from '@/components/transaction/TransactionEditModal';
import { useTransactions } from '@/hooks/useTransactions';
import { useMembers } from '@/hooks/useAccounts';
import { formatAmount } from '@/lib/parser';
import type { Transaction } from '@/types';

dayjs.locale('ko');

type Period = 'weekly' | 'monthly' | 'yearly';

// ── 캘린더 뷰 컴포넌트 ──
function CalendarView({
  year, month, calendarData, maxDayExpense, selectedDate, onSelectDate, grouped, onEditTx, today,
}: {
  year: number; month: number;
  calendarData: Record<string, { expense: number; income: number; count: number }>;
  maxDayExpense: number;
  selectedDate: string | null;
  onSelectDate: (d: string) => void;
  grouped: Record<string, import('@/types').Transaction[]>;
  onEditTx: (tx: import('@/types').Transaction) => void;
  today: string;
}) {
  const firstDay = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const daysInMonth = firstDay.daysInMonth();
  // 월요일 기준 시작 오프셋 (0=월 ~ 6=일)
  const startOffset = (firstDay.day() + 6) % 7;
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
  });

  const DOW = ['월', '화', '수', '목', '금', '토', '일'];

  return (
    <div>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-xs font-medium py-1 ${i === 5 ? 'text-blue-400' : i === 6 ? 'text-rose-400' : 'text-gray-400'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dayNum, idx) => {
          if (!dayNum) return <div key={idx} />;
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
          const data = calendarData[dateStr];
          const isToday = dateStr === today;
          const isSelected = selectedDate === dateStr;
          const dow = idx % 7; // 0=월 ... 6=일
          const intensity = data?.expense ? Math.min(Math.round((data.expense / maxDayExpense) * 5), 5) : 0;
          const bgColors = ['bg-white', 'bg-rose-50', 'bg-rose-100', 'bg-rose-200', 'bg-rose-300', 'bg-rose-400'];

          return (
            <button
              key={dateStr}
              onClick={() => data?.count ? onSelectDate(dateStr) : undefined}
              className={`relative rounded-xl p-1.5 text-left transition-all min-h-[56px] border
                ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-transparent'}
                ${data?.count ? 'active:scale-95' : 'cursor-default'}
                ${intensity > 0 ? bgColors[intensity] : 'bg-white'}
              `}
            >
              <span className={`text-xs font-semibold block mb-0.5
                ${isToday ? 'w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px]' : ''}
                ${!isToday && dow === 5 ? 'text-blue-500' : ''}
                ${!isToday && dow === 6 ? 'text-rose-500' : ''}
                ${!isToday && dow < 5 ? 'text-gray-700' : ''}
              `}>
                {dayNum}
              </span>
              {data?.expense > 0 && (
                <span className={`text-[9px] leading-tight block font-medium ${intensity >= 3 ? 'text-rose-900' : 'text-rose-500'}`}>
                  -{formatAmount(data.expense)}
                </span>
              )}
              {data?.income > 0 && (
                <span className="text-[9px] leading-tight block text-emerald-600 font-medium">
                  +{formatAmount(data.income)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜 거래 목록 */}
      {selectedDate && grouped[selectedDate] && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-gray-700 px-1 mb-2">
            {dayjs(selectedDate).format('M월 D일 (ddd)')}
          </p>
          <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-50">
            {grouped[selectedDate].map((tx) => (
              <button
                key={tx.id}
                className="w-full text-left active:bg-gray-50 rounded-xl transition-colors"
                onClick={() => onEditTx(tx)}
              >
                <TransactionCard transaction={tx} showDate={false} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_FILTERS = [
  { label: '전체',    value: '' },
  { label: '변동지출', value: 'variable_expense' },
  { label: '고정지출', value: 'fixed_expense' },
  { label: '수입',    value: 'income' },
  { label: '이동',    value: 'transfer' },
];

// 월요일 기준 주 시작 계산
function getWeekStart(offset: number) {
  const today = dayjs();
  const dow = today.day(); // 0=일, 1=월 ... 6=토
  const daysToMonday = dow === 0 ? -6 : 1 - dow;
  return today.add(daysToMonday + offset * 7, 'day').startOf('day');
}

export default function TransactionsPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [period, setPeriod] = useState<Period>('monthly');
  const [typeFilter, setTypeFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 주간 offset (0=이번주, -1=지난주 ...)
  const [weekOffset, setWeekOffset] = useState(0);
  // 월간
  const today = dayjs();
  const [year, setYear] = useState(today.year());
  const [month, setMonth] = useState(today.month() + 1);
  // 연간
  const [yearView, setYearView] = useState(today.year());

  // 날짜 범위 계산
  const { startDate, endDate, periodLabel } = useMemo(() => {
    if (period === 'weekly') {
      const ws = getWeekStart(weekOffset);
      const we = ws.add(6, 'day');
      const label = weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주'
        : `${ws.format('M/D')} ~ ${we.format('M/D')}`;
      return {
        startDate: ws.format('YYYY-MM-DD'),
        endDate: we.format('YYYY-MM-DD'),
        periodLabel: label,
      };
    }
    if (period === 'yearly') {
      return {
        startDate: `${yearView}-01-01`,
        endDate: `${yearView}-12-31`,
        periodLabel: `${yearView}년`,
      };
    }
    // monthly
    const base = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
    const isCurrentMonth = year === today.year() && month === today.month() + 1;
    return {
      startDate: base.startOf('month').format('YYYY-MM-DD'),
      endDate: base.endOf('month').format('YYYY-MM-DD'),
      periodLabel: isCurrentMonth ? `${year}년 ${month}월 (이번 달)` : `${year}년 ${month}월`,
    };
  }, [period, weekOffset, year, month, yearView]);

  const { transactions: rawTransactions, loading, refetch } = useTransactions({
    startDate,
    endDate,
    type: typeFilter || undefined,
    memberId: (memberFilter && memberFilter !== 'together') ? memberFilter : undefined,
  });

  // "함께" 필터: member_id가 null인 거래만 클라이언트에서 필터
  const memberFiltered = memberFilter === 'together'
    ? rawTransactions.filter((t) => !(t as any).member_id)
    : rawTransactions;

  // 검색 필터
  const transactions = searchQuery.trim()
    ? memberFiltered.filter((t) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          t.name?.toLowerCase().includes(q) ||
          t.merchant_name?.toLowerCase().includes(q) ||
          t.memo?.toLowerCase().includes(q) ||
          t.category_main?.toLowerCase().includes(q)
        );
      })
    : memberFiltered;

  const { members } = useMembers();

  // 합계
  const totalExpense = transactions
    .filter((t) => ['variable_expense', 'fixed_expense'].includes(t.type))
    .reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  // ── 연간 뷰: 월별 그룹 ──
  const monthlyGroups = useMemo(() => {
    if (period !== 'yearly') return [];
    const map: Record<number, { expense: number; income: number; count: number }> = {};
    for (let m = 1; m <= 12; m++) map[m] = { expense: 0, income: 0, count: 0 };
    transactions.forEach((t) => {
      const m = dayjs(t.date).month() + 1;
      if (['variable_expense', 'fixed_expense'].includes(t.type)) map[m].expense += t.amount;
      else if (t.type === 'income') map[m].income += t.amount;
      map[m].count++;
    });
    return Object.entries(map).map(([m, v]) => ({ month: Number(m), ...v }));
  }, [transactions, period]);

  const maxMonthlyExpense = Math.max(...monthlyGroups.map((g) => g.expense), 1);

  // ── 날짜별 그룹 (주간/월간) ──
  const grouped = useMemo(() => {
    if (period === 'yearly') return {};
    return transactions.reduce<Record<string, Transaction[]>>((acc, tx) => {
      if (!acc[tx.date]) acc[tx.date] = [];
      acc[tx.date].push(tx);
      return acc;
    }, {});
  }, [transactions, period]);
  const sortedDates = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));

  // 캘린더용: 날짜별 지출/수입 집계
  const calendarData = useMemo(() => {
    const map: Record<string, { expense: number; income: number; count: number }> = {};
    transactions.forEach((t) => {
      if (!map[t.date]) map[t.date] = { expense: 0, income: 0, count: 0 };
      if (['variable_expense', 'fixed_expense'].includes(t.type)) map[t.date].expense += t.amount;
      else if (t.type === 'income') map[t.date].income += t.amount;
      map[t.date].count++;
    });
    return map;
  }, [transactions]);

  const maxDayExpense = useMemo(
    () => Math.max(...Object.values(calendarData).map((d) => d.expense), 1),
    [calendarData]
  );

  // ── 네비게이션 ──
  const goPrev = () => {
    if (period === 'weekly') setWeekOffset((o) => o - 1);
    else if (period === 'monthly') {
      if (month === 1) { setYear((y) => y - 1); setMonth(12); }
      else setMonth((m) => m - 1);
    } else setYearView((y) => y - 1);
  };
  const goNext = () => {
    if (period === 'weekly') setWeekOffset((o) => o + 1);
    else if (period === 'monthly') {
      if (month === 12) { setYear((y) => y + 1); setMonth(1); }
      else setMonth((m) => m + 1);
    } else setYearView((y) => y + 1);
  };
  const goToday = () => {
    if (period === 'weekly') setWeekOffset(0);
    else if (period === 'monthly') { setYear(today.year()); setMonth(today.month() + 1); }
    else setYearView(today.year());
  };
  const isCurrentPeriod =
    (period === 'weekly' && weekOffset === 0) ||
    (period === 'monthly' && year === today.year() && month === today.month() + 1) ||
    (period === 'yearly' && yearView === today.year());

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-lg font-bold text-gray-900 flex-1">거래 내역</h1>
          {period === 'monthly' && (
            <div className="flex bg-gray-100 rounded-xl p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}
              >
                <List size={16} />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-1.5 rounded-lg transition-colors ${viewMode === 'calendar' ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}
              >
                <CalendarDays size={16} />
              </button>
            </div>
          )}
          <button
            onClick={() => { setShowSearch((v) => !v); if (showSearch) setSearchQuery(''); }}
            className={`p-2 rounded-xl transition-colors ${showSearch ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            <Search size={18} />
          </button>
        </div>

        {showSearch && (
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="거래명, 메모, 카테고리 검색..."
              autoFocus
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={15} />
              </button>
            )}
          </div>
        )}

        {/* 주간/월간/연간 탭 */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
          {(['weekly', 'monthly', 'yearly'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${
                period === p ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
              }`}
            >
              {p === 'weekly' ? '주간' : p === 'monthly' ? '월간' : '연간'}
            </button>
          ))}
        </div>

        {/* 기간 네비게이션 */}
        <div className="flex items-center justify-center gap-3 mb-3">
          <button onClick={goPrev} className="p-2 text-gray-400 active:text-gray-700 text-lg">‹</button>
          <button
            onClick={goToday}
            className="text-sm font-semibold text-gray-800 min-w-[140px] text-center"
          >
            {periodLabel}
            {!isCurrentPeriod && (
              <span className="ml-1.5 text-xs font-normal text-indigo-400 underline">오늘로</span>
            )}
          </button>
          <button onClick={goNext} className="p-2 text-gray-400 active:text-gray-700 text-lg">›</button>
        </div>

        {/* 요약 */}
        <div className="flex gap-4 justify-center text-sm mb-3">
          <span className="text-rose-500 font-medium">지출 {formatAmount(totalExpense)}</span>
          <span className="text-gray-300">|</span>
          <span className="text-emerald-600 font-medium">수입 {formatAmount(totalIncome)}</span>
          {totalExpense > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className={`font-medium ${totalIncome - totalExpense >= 0 ? 'text-gray-700' : 'text-rose-600'}`}>
                {totalIncome - totalExpense >= 0 ? '잉여 ' : '적자 '}
                {formatAmount(Math.abs(totalIncome - totalExpense))}
              </span>
            </>
          )}
        </div>

        {/* 타입 필터 (연간 뷰 제외) */}
        {period !== 'yearly' && (
          <div className="space-y-2">
            {/* 유형 필터 */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                    typeFilter === f.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* 작성자 필터 (구성원 2명 이상일 때만) */}
            {members.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 flex-shrink-0">작성자</span>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                  {/* 전체 */}
                  <button
                    onClick={() => setMemberFilter('')}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
                      memberFilter === '' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    전체
                  </button>
                  {/* 개인 멤버 */}
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMemberFilter(memberFilter === m.id ? '' : m.id)}
                      className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-all border ${
                        memberFilter === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600'
                      }`}
                      style={memberFilter === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="px-4 py-3 pb-40 space-y-4">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        ) : period === 'yearly' ? (
          /* ── 연간 뷰 ── */
          <div className="space-y-2">
            {monthlyGroups.map(({ month: m, expense, income, count }) => {
              const barWidth = expense > 0 ? Math.round((expense / maxMonthlyExpense) * 100) : 0;
              const isCurMonth = yearView === today.year() && m === today.month() + 1;
              return (
                <button
                  key={m}
                  onClick={() => { setPeriod('monthly'); setYear(yearView); setMonth(m); }}
                  className={`w-full bg-white rounded-2xl border px-4 py-3 text-left active:bg-gray-50 transition-colors ${
                    isCurMonth ? 'border-indigo-200' : 'border-gray-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-semibold ${isCurMonth ? 'text-indigo-600' : 'text-gray-700'}`}>
                      {m}월 {isCurMonth && <span className="text-xs font-normal text-indigo-400">이번 달</span>}
                    </span>
                    <div className="flex gap-3 text-xs">
                      {expense > 0 && <span className="text-rose-500">-{formatAmount(expense)}</span>}
                      {income > 0  && <span className="text-emerald-600">+{formatAmount(income)}</span>}
                      {count === 0 && <span className="text-gray-300">내역 없음</span>}
                    </div>
                  </div>
                  {expense > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isCurMonth ? 'bg-indigo-400' : 'bg-rose-300'}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : period === 'monthly' && viewMode === 'calendar' ? (
          /* ── 캘린더 뷰 ── */
          <CalendarView
            year={year}
            month={month}
            calendarData={calendarData}
            maxDayExpense={maxDayExpense}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(selectedDate === d ? null : d)}
            grouped={grouped}
            onEditTx={(tx) => setEditTx(tx)}
            today={today.format('YYYY-MM-DD')}
          />
        ) : sortedDates.length === 0 ? (
          <div className="py-12 text-center px-6">
            <p className="text-4xl mb-3">
              {searchQuery ? '🔍' : memberFilter === 'together' ? '🫂' : memberFilter ? '👤' : '🔍'}
            </p>
            {memberFilter ? (
              <>
                <p className="text-gray-700 font-medium text-sm mb-1">
                  {members.find((m) => m.id === memberFilter)?.name}의 거래가 없어요
                </p>
                <p className="text-gray-400 text-xs leading-5">
                  거래 입력 시 작성자를 선택하면<br />구성원별로 내역을 볼 수 있어요
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm">거래 내역이 없어요</p>
            )}
          </div>
        ) : (
          /* ── 주간/월간 리스트 뷰 ── */
          sortedDates.map((date) => {
            const dayTxs = grouped[date];
            const dayExpense = dayTxs
              .filter((t) => ['variable_expense', 'fixed_expense'].includes(t.type))
              .reduce((sum, t) => sum + t.amount, 0);
            const dayIncome = dayTxs
              .filter((t) => t.type === 'income')
              .reduce((sum, t) => sum + t.amount, 0);

            return (
              <div key={date}>
                <div className="flex items-center justify-between px-1 mb-1.5">
                  <p className="text-sm font-semibold text-gray-700">
                    {dayjs(date).format('M월 D일 (ddd)')}
                  </p>
                  <div className="flex gap-3 text-xs">
                    {dayExpense > 0 && <span className="text-rose-500">-{formatAmount(dayExpense)}</span>}
                    {dayIncome > 0  && <span className="text-emerald-600">+{formatAmount(dayIncome)}</span>}
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-50">
                  {dayTxs.map((tx) => (
                    <button
                      key={tx.id}
                      className="w-full text-left active:bg-gray-50 rounded-xl transition-colors"
                      onClick={() => setEditTx(tx)}
                    >
                      <TransactionCard transaction={tx} showDate={false} />
                    </button>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 하단 입력 버튼 */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 pt-3 bg-gradient-to-t from-gray-50 to-transparent">
        <button
          onClick={() => setModalOpen(true)}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200"
        >
          <Plus size={20} /> 거래 입력
        </button>
      </div>

      <TransactionInputModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); refetch(); }}
      />
      {editTx && (
        <TransactionEditModal
          transaction={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); refetch(); }}
          onDeleted={() => { setEditTx(null); refetch(); }}
        />
      )}
    </div>
  );
}
