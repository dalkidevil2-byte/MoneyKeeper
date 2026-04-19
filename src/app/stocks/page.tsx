'use client';

import Link from 'next/link';
import {
  Briefcase,
  LineChart,
  ChevronLeft,
  ChevronRight,
  Settings,
  Receipt,
  FlaskConical,
} from 'lucide-react';

/**
 * 주식 섹션 홈
 * 포트폴리오 / 거래내역 / 차트 / 모의투자 진입점
 */
export default function StocksHomePage() {
  const sections = [
    {
      href: '/stocks/portfolio',
      icon: Briefcase,
      title: '포트폴리오',
      desc: '보유종목 · 분석 · 시드머니',
      color: 'emerald',
    },
    {
      href: '/stocks/transactions',
      icon: Receipt,
      title: '거래내역',
      desc: '매수 · 매도 입력',
      color: 'amber',
    },
    {
      href: '/stocks/chart',
      icon: LineChart,
      title: '차트',
      desc: '종목별 추이',
      color: 'sky',
    },
    {
      href: '/stocks/paper',
      icon: FlaskConical,
      title: '모의투자',
      desc: '실계좌와 분리된 연습 공간',
      color: 'violet',
    },
  ];

  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-600',
    amber:   'bg-amber-100   text-amber-600',
    sky:     'bg-sky-100     text-sky-600',
    violet:  'bg-violet-100  text-violet-600',
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">주식</h1>
          <Link
            href="/stocks/settings"
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-600"
            title="소유자 · 계좌 관리"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* 섹션 카드 */}
      <div className="px-5 pt-6 space-y-3">
        {sections.map(({ href, icon: Icon, title, desc, color }) => (
          <Link
            key={href}
            href={href}
            className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center shrink-0`}>
                <Icon size={24} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold text-gray-900">{title}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
              </div>
              <ChevronRight size={18} className="text-gray-300" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
