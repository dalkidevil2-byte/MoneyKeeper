'use client';

import Link from 'next/link';
import { Wallet, TrendingUp, ChevronRight, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import BudgetSummary from '@/components/home/BudgetSummary';
import StockSummary from '@/components/home/StockSummary';

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
      <div className="px-5 pt-10 pb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Assistant</h1>
        <p className="text-sm text-gray-500 mt-1">
          {today.format('YYYY년 M월 D일 dddd')}
        </p>
      </div>

      {/* 앱 카드들 */}
      <div className="px-5 space-y-3">
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

        {/* 주식 카드 */}
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

        {/* 추가 예정 플레이스홀더 */}
        <div className="bg-gray-50 rounded-2xl p-5 border-2 border-dashed border-gray-200 flex items-center gap-4 opacity-60">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center shrink-0">
            <Plus size={28} className="text-gray-400" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-600">곧 추가 예정</h2>
            <p className="text-sm text-gray-400 mt-0.5">투두 · 캘린더 · 일기</p>
          </div>
        </div>
      </div>
    </div>
  );
}
