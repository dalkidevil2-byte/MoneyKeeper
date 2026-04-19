'use client';

import { useState, useEffect } from 'react';
import { Plus, ChevronRight, Settings, Eye, EyeOff, TrendingUp, TrendingDown, Minus, Inbox, Home } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import Link from 'next/link';

import TransactionInputModal from '@/components/transaction/TransactionInputModal';
import TransactionEditModal from '@/components/transaction/TransactionEditModal';
import TransactionInboxSheet from '@/components/transaction/TransactionInboxSheet';
import TransactionCard from '@/components/transaction/TransactionCard';
import BudgetAlertBanner from '@/components/BudgetAlertBanner';
import BudgetDetailSheet from '@/components/BudgetDetailSheet';
import InsightCard from '@/components/InsightCard';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets, useFixedExpenseTemplates } from '@/hooks/useAccounts';
import { formatAmount } from '@/lib/parser';

dayjs.locale('ko');

export default function HomePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [hideAmount, setHideAmount] = useState(false);
  const [editTx, setEditTx] = useState<import('@/types').Transaction | null>(null);
  const [prefilledFT, setPrefilledFT] = useState<any>(null);
  const [budgetDetail, setBudgetDetail] = useState<{ category: string; budget: number } | null>(null);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);

  // Inbox 미확인 건수 조회 (needs_review만 뱃지에 표시)
  useEffect(() => {
    fetch('/api/transactions/inbox')
      .then((r) => r.json())
      .then((d) => {
        const count = (d.transactions ?? []).filter((t: { status: string }) => t.status === 'reviewed').length;
        setInboxCount(count);
      });
  }, []);

  const today = dayjs();
  const startOfMonth = today.startOf('month').format('YYYY-MM-DD');
  const endOfMonth = today.endOf('month').format('YYYY-MM-DD');
  const prevMonth = today.subtract(1, 'month');
  const startOfPrevMonth = prevMonth.startOf('month').format('YYYY-MM-DD');
  const endOfPrevMonth = prevMonth.endOf('month').format('YYYY-MM-DD');

  const { transactions, loading: txLoading, refetch } = useTransactions({
    startDate: startOfMonth,
    endDate: endOfMonth,
  });
  const { transactions: prevTransactions } = useTransactions({
    startDate: startOfPrevMonth,
    endDate: endOfPrevMonth,
  });
  const { budgets } = useBudgets();
  const { templates: fixedTemplates } = useFixedExpenseTemplates();

  const monthlyVarExpense = transactions
    .filter((t) => t.type === 'variable_expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyFixedExpense = transactions
    .filter((t) => t.type === 'fixed_expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpense = monthlyVarExpense + monthlyFixedExpense;

  const prevVarExpense = prevTransactions
    .filter((t) => t.type === 'variable_expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const prevFixedExpense = prevTransactions
    .filter((t) => t.type === 'fixed_expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const prevIncome = prevTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const prevExpense = prevVarExpense + prevFixedExpense;

  const recentTransactions = transactions.slice(0, 8);

  // 전체 예산 / 하위 예산 분리
  const totalBudget = budgets.find((b) => b.is_total);
  const subBudgets = budgets.filter((b) => !b.is_total);

  // 전체 예산 사용률
  const totalBudgetAmount = totalBudget?.amount ?? 0;
  const totalRate = totalBudgetAmount > 0 ? Math.min(Math.round((monthlyExpense / totalBudgetAmount) * 100), 100) : 0;
  const totalRemaining = totalBudgetAmount - monthlyExpense;

  const barColor = (rate: number) =>
    rate >= 100 ? 'bg-rose-400' :
    rate >= 90  ? 'bg-orange-400' :
    rate >= 80  ? 'bg-amber-400' :
    'bg-emerald-400';

  const rateColor = (rate: number) =>
    rate >= 100 ? 'text-rose-300' :
    rate >= 90  ? 'text-orange-300' :
    rate >= 80  ? 'text-amber-300' :
    'text-emerald-300';

  // 미등록 정기 거래 계산 (오늘 이전 날짜인데 이번달 거래내역 없는 항목)
  const unregisteredFixed = fixedTemplates.filter((ft) => {
    const dueDate = today.date(ft.due_day);
    if (dueDate.isAfter(today)) return false;
    const txType = ft.type ?? 'fixed_expense';
    return !transactions.some((t) => t.type === txType && t.name === ft.name);
  });

  const handleBulkRegister = async () => {
    if (bulkRegistering || unregisteredFixed.length === 0) return;
    setBulkRegistering(true);
    const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
    // 변동 금액 항목은 일괄 등록 제외 (사용자가 개별 등록)
    const fixedOnly = unregisteredFixed.filter((ft) => !(ft as any).is_variable);
    await Promise.all(
      fixedOnly.map((ft) =>
        fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            household_id: HOUSEHOLD_ID,
            date: today.date(ft.due_day).format('YYYY-MM-DD'),
            type: ft.type ?? 'fixed_expense',
            amount: ft.amount,
            name: ft.name,
            merchant_name: ft.name,
            category_main: ft.category_main,
            category_sub: ft.category_sub,
            payment_method_id: ft.payment_method_id ?? null,
            account_from_id: (ft as any).account_from_id ?? null,
            account_to_id: (ft as any).account_to_id ?? null,
            memo: '고정지출 자동 등록',
            input_type: 'manual',
          }),
        })
      )
    );
    setBulkRegistering(false);
    refetch();
  };

  // 예산 알림 계산 (80% 이상인 카테고리)
  const budgetAlerts = subBudgets
    .map((b) => {
      const spent = transactions
        .filter((t) => t.type === 'variable_expense' && t.category_main === b.category_main)
        .reduce((sum, t) => sum + t.amount, 0);
      const rate = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      return { category: b.category_main, rate, amount: spent, budget: b.amount, emoji: getCategoryEmoji(b.category_main) };
    })
    .filter((a) => a.rate >= 80)
    .sort((a, b) => b.rate - a.rate);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* 상단 헤더 */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 text-white px-5 pt-6 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="p-2 -ml-1 bg-white/15 rounded-xl shrink-0">
              <Home size={18} className="text-white" />
            </Link>
            <div className="min-w-0">
              <p className="text-indigo-200 text-sm">{today.format('YYYY년 M월')}</p>
              <h1 className="text-2xl font-bold mt-0.5 truncate">우리집 가계부 💰</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setInboxOpen(true)} className="relative p-2 bg-white/15 rounded-xl">
              <Inbox size={18} className="text-white" />
              {inboxCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {inboxCount > 9 ? '9+' : inboxCount}
                </span>
              )}
            </button>
            <Link href="/settings" className="p-2 bg-white/15 rounded-xl">
              <Settings size={18} className="text-white" />
            </Link>
          </div>
        </div>

        {/* 이번 달 지출 요약 */}
        <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-indigo-100 text-sm font-medium">이번 달 요약</p>
            <button onClick={() => setHideAmount(h => !h)} className="text-indigo-300">
              {hideAmount ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {/* 수입/지출 */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-indigo-200 text-xs mb-0.5">총 지출</p>
              <p className="text-2xl font-bold text-rose-300">
                {hideAmount ? '•••' : formatAmount(monthlyExpense)}
              </p>
              <p className="text-indigo-200 text-xs mt-0.5">
                변동 {hideAmount ? '•••' : formatAmount(monthlyVarExpense)} · 고정 {hideAmount ? '•••' : formatAmount(monthlyFixedExpense)}
              </p>
            </div>
            <div>
              <p className="text-indigo-200 text-xs mb-0.5">총 수입</p>
              <p className="text-2xl font-bold text-emerald-300">
                {hideAmount ? '•••' : formatAmount(monthlyIncome)}
              </p>
              {monthlyIncome > 0 && (
                <p className={`text-xs mt-0.5 font-medium ${monthlyIncome - monthlyExpense >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {hideAmount ? '•••' : `${monthlyIncome - monthlyExpense >= 0 ? '잉여 +' : '적자 -'}${formatAmount(Math.abs(monthlyIncome - monthlyExpense))}`}
                </p>
              )}
            </div>
          </div>

          {/* 전월 비교 */}
          {prevExpense > 0 && (
            <div className="border-t border-white/20 pt-2.5 flex items-center gap-2">
              {(() => {
                const diff = monthlyExpense - prevExpense;
                const pct = Math.round(Math.abs(diff) / prevExpense * 100);
                const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
                const color = diff > 0 ? 'text-rose-300' : diff < 0 ? 'text-emerald-300' : 'text-indigo-200';
                return (
                  <>
                    <Icon size={14} className={color} />
                    <p className={`text-xs ${color}`}>
                      전월 대비 {hideAmount ? '•••' : `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${formatAmount(Math.abs(diff))}`}
                      {!hideAmount && ` (${pct}%)`}
                    </p>
                    <p className="text-xs text-indigo-300 ml-auto">전월 {hideAmount ? '•••' : formatAmount(prevExpense)}</p>
                  </>
                );
              })()}
            </div>
          )}

          {totalBudget && (
            <div className="border-t border-white/20 pt-2.5 mt-2.5">
              <div className="flex justify-between text-xs text-indigo-200 mb-1">
                <span>예산 사용률</span>
                <span className={rateColor(totalRate)}>{totalRate}% · 잔여 {hideAmount ? '•••' : formatAmount(Math.max(totalBudgetAmount - monthlyExpense, 0))}</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor(totalRate)}`} style={{ width: `${totalRate}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-40">

        {/* 미등록 고정지출 알림 */}
        {unregisteredFixed.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-700">📋 이번 달 미등록 고정지출</p>
              {unregisteredFixed.length > 1 && (
                <button
                  onClick={handleBulkRegister}
                  disabled={bulkRegistering}
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded-xl font-medium disabled:opacity-50 flex items-center gap-1"
                >
                  {bulkRegistering ? (
                    <><div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" /> 등록 중</>
                  ) : `전체 ${unregisteredFixed.length}개 등록`}
                </button>
              )}
            </div>
            {unregisteredFixed.map((ft) => {
              const isVariable = (ft as any).is_variable;
              return (
                <div key={ft.id} className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-amber-800 font-medium">{ft.name}</p>
                      {isVariable && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
                          변동
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-amber-500">
                      매월 {ft.due_day}일
                      {isVariable
                        ? ' · 명세서 확인 후 입력'
                        : ` · ${formatAmount(ft.amount)}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      // 변동이면 amount를 비워서 사용자 입력 유도
                      setPrefilledFT(isVariable ? { ...ft, amount: 0 } : ft);
                      setModalOpen(true);
                    }}
                    className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-xl font-medium"
                  >
                    등록
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 예산 초과 알림 */}
        {budgetAlerts.length > 0 && (
          <BudgetAlertBanner alerts={budgetAlerts} />
        )}

        {/* 예산 현황 */}
        {(totalBudget || subBudgets.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="font-semibold text-gray-800">예산 현황</h2>
              <Link href="/settings" className="text-xs text-indigo-500 flex items-center gap-0.5">
                관리 <ChevronRight size={14} />
              </Link>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">

              {/* 전체 예산 */}
              {totalBudget && (
                <div className="px-4 py-3.5 border-b border-gray-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800">
                      전체 예산
                    </span>
                    <span className={`text-sm font-bold ${rateColor(totalRate).replace('text-', 'text-').replace('300', '500')}`}>
                      {totalRate}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all ${barColor(totalRate)}`}
                      style={{ width: `${totalRate}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>사용 {hideAmount ? '•••' : formatAmount(monthlyExpense)}</span>
                    <span>남은 {hideAmount ? '•••' : (totalRemaining >= 0 ? formatAmount(totalRemaining) : `-${formatAmount(Math.abs(totalRemaining))}`)}</span>
                    <span>총 {hideAmount ? '•••' : formatAmount(totalBudgetAmount)}</span>
                  </div>
                </div>
              )}

              {/* 카테고리별 하위 예산 */}
              {subBudgets.length > 0 ? (
                subBudgets.map((budget, idx) => {
                  const rate = budget.usage_rate ?? 0;
                  // 카테고리 기준 실제 지출
                  const catExpense = transactions
                    .filter((t) =>
                      t.type === 'variable_expense' &&
                      t.category_main === budget.category_main
                    )
                    .reduce((sum, t) => sum + t.amount, 0);
                  const catRate = budget.amount > 0 ? Math.min(Math.round((catExpense / budget.amount) * 100), 100) : 0;

                  return (
                    <button
                      key={budget.id}
                      onClick={() => setBudgetDetail({ category: budget.category_main, budget: budget.amount })}
                      className={`w-full text-left px-4 py-3 active:bg-gray-50 transition-colors ${idx < subBudgets.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{getCategoryEmoji(budget.category_main)}</span>
                          <span className="text-sm font-medium text-gray-700">{budget.name}</span>
                        </div>
                        <div className="text-right">
                          <span className={`text-xs font-bold ${catRate >= 100 ? 'text-rose-500' : catRate >= 80 ? 'text-amber-500' : 'text-gray-500'}`}>
                            {catRate}%
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            {hideAmount ? '•••' : `${formatAmount(catExpense)} / ${formatAmount(budget.amount)}`}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(catRate)}`}
                          style={{ width: `${catRate}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              ) : (
                !totalBudget && (
                  <div className="px-4 py-5 text-center">
                    <p className="text-sm text-gray-400">아직 예산이 없어요</p>
                    <Link href="/settings" className="text-xs text-indigo-500 mt-1 block">
                      + 예산 설정하러 가기
                    </Link>
                  </div>
                )
              )}
            </div>
          </section>
        )}

        {/* 예산 없을 때 */}
        {budgets.length === 0 && (
          <Link href="/settings" className="block bg-white rounded-2xl border border-dashed border-indigo-200 p-5 text-center">
            <p className="text-2xl mb-2">🎯</p>
            <p className="text-sm font-medium text-indigo-600">예산을 설정해보세요</p>
            <p className="text-xs text-gray-400 mt-1">식비, 교통비 등 항목별로 관리할 수 있어요</p>
          </Link>
        )}

        {/* 소비 인사이트 */}
        <InsightCard />

        {/* 최근 거래 */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="font-semibold text-gray-800">최근 거래</h2>
            <Link href="/transactions" className="text-xs text-indigo-500 flex items-center gap-0.5">
              전체보기 <ChevronRight size={14} />
            </Link>
          </div>

          {txLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 flex justify-center">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-4xl mb-3">📝</p>
              <p className="text-gray-500 text-sm">아직 거래 내역이 없어요</p>
              <p className="text-gray-400 text-xs mt-1">아래 + 버튼으로 첫 거래를 기록해보세요</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 px-4 divide-y divide-gray-50">
              {recentTransactions.map((tx) => (
                <button
                  key={tx.id}
                  className="w-full text-left active:bg-gray-50 rounded-xl transition-colors"
                  onClick={() => setEditTx(tx)}
                >
                  <TransactionCard transaction={tx} />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 하단 고정 입력 버튼 */}
      <div className="fixed bottom-16 left-0 right-0 px-4 pb-2 pt-3 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
        <button
          onClick={() => setModalOpen(true)}
          className="w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white font-bold text-base rounded-2xl shadow-lg shadow-indigo-200 active:bg-indigo-700 active:scale-95 transition-all"
        >
          <Plus size={22} /> 거래 입력
        </button>
      </div>

      <TransactionInputModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setPrefilledFT(null); }}
        onSaved={() => { setModalOpen(false); setPrefilledFT(null); refetch(); }}
        prefill={prefilledFT}
      />

      {editTx && (
        <TransactionEditModal
          transaction={editTx}
          onClose={() => setEditTx(null)}
          onSaved={() => { setEditTx(null); refetch(); }}
          onDeleted={() => { setEditTx(null); refetch(); }}
        />
      )}

      {inboxOpen && (
        <TransactionInboxSheet
          onClose={() => setInboxOpen(false)}
          onUpdated={() => setInboxCount((c) => Math.max(0, c - 1))}
        />
      )}

      {budgetDetail && (
        <BudgetDetailSheet
          category={budgetDetail.category}
          emoji={getCategoryEmoji(budgetDetail.category)}
          spent={transactions
            .filter((t) => t.type === 'variable_expense' && t.category_main === budgetDetail.category)
            .reduce((s, t) => s + t.amount, 0)}
          budget={budgetDetail.budget}
          transactions={transactions.filter(
            (t) => t.type === 'variable_expense' && t.category_main === budgetDetail.category
          )}
          onClose={() => setBudgetDetail(null)}
          onEditTx={(tx) => setEditTx(tx)}
        />
      )}
    </div>
  );
}

function getCategoryEmoji(category: string): string {
  const map: Record<string, string> = {
    '식비': '🍽️', '카페': '☕', '교통': '🚌', '쇼핑': '🛍️', '의료': '💊',
    '교육': '📚', '취미': '🎮', '고정비': '🔒', '생활': '🧺',
    '주거': '🏠', '저축/투자': '📈', '육아': '👶', '출장': '✈️', '기타': '📝',
  };
  return map[category] ?? '💰';
}
