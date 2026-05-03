'use client';

import Link from 'next/link';
import { Wallet, TrendingUp, ChevronRight, ListTodo, Archive, Sparkles } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import BudgetSummary from '@/components/home/BudgetSummary';
import StockSummary from '@/components/home/StockSummary';
import TodoSummary from '@/components/home/TodoSummary';
import NotificationBell from '@/components/todo/NotificationBell';
import ActivityChips from '@/components/todo/ActivityChips';
import { STOCKS_DISABLED } from '@/lib/app-flags';

dayjs.locale('ko');

/**
 * My Assistant 허브 페이지
 * 가계부 / 주식 / (추후) 투두 등의 진입점
 */
export default function HubPage() {
  const today = dayjs();

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="px-5 pt-10 pb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Assistant</h1>
          <p className="text-sm text-gray-500 mt-1">
            {today.format('YYYY년 M월 D일 dddd')}
          </p>
        </div>
        <NotificationBell />
      </div>

      {/* 활동 추적 — 빠른 시작/정지 */}
      <div className="px-5 mb-3">
        <ActivityChips />
      </div>

      {/* 앱 카드들 */}
      <div className="px-5 space-y-3">
        {/* AI 어시스턴트 카드 */}
        <Link
          href="/assistant"
          className="block bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-5 shadow-sm border border-violet-100 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <Sparkles size={28} className="text-violet-600" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900">AI 어시스턴트</h2>
              <p className="text-sm text-gray-500 mt-0.5">자연어 질문 · 명령 · 인사이트</p>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </div>
        </Link>

        {/* 할일 카드 */}
        <Link
          href="/todo"
          className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <ListTodo size={28} className="text-amber-600" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900">할일</h2>
              <p className="text-sm text-gray-500 mt-0.5">오늘의 일정 · 루틴</p>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </div>
          <TodoSummary />
        </Link>

        {/* 가계부 카드 */}
        <Link
          href="/budget"
          className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
              <Wallet size={28} className="text-indigo-600" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900">가계부</h2>
              <p className="text-sm text-gray-500 mt-0.5">지출 · 예산 · 영수증</p>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </div>
          <BudgetSummary />
        </Link>

        {/* 주식 카드 — 솔로/일반 사용자용 (NEXT_PUBLIC_DISABLE_STOCKS=true 면 숨김) */}
        {!STOCKS_DISABLED && (
          <Link
            href="/stocks"
            className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                <TrendingUp size={28} className="text-emerald-600" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">주식</h2>
                <p className="text-sm text-gray-500 mt-0.5">포트폴리오 · 관심종목</p>
              </div>
              <ChevronRight size={20} className="text-gray-300" />
            </div>
            <StockSummary />
          </Link>
        )}

        {/* 아카이브 카드 */}
        <Link
          href="/archive"
          className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
              <Archive size={28} className="text-slate-700" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-gray-900">아카이브</h2>
              <p className="text-sm text-gray-500 mt-0.5">일기 · 레시피 · 독서 · 자유 컬렉션</p>
            </div>
            <ChevronRight size={20} className="text-gray-300" />
          </div>
        </Link>

      </div>
    </div>
  );
}
