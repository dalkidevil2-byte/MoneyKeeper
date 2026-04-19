'use client';

import Link from 'next/link';
import {
  Briefcase,
  Receipt,
  Settings,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
} from 'lucide-react';

export default function PaperHomePage() {
  const sections = [
    {
      href: '/stocks/paper/portfolio',
      icon: Briefcase,
      title: '포트폴리오',
      desc: '모의 보유 · 분석',
      color: 'violet',
    },
    {
      href: '/stocks/paper/transactions',
      icon: Receipt,
      title: '거래내역',
      desc: '모의 매수 · 매도',
      color: 'amber',
    },
    {
      href: '/stocks/paper/settings',
      icon: Settings,
      title: '소유자 · 계좌',
      desc: '모의 계좌 관리',
      color: 'sky',
    },
  ];

  const colorClasses: Record<string, string> = {
    violet: 'bg-violet-100 text-violet-600',
    amber:  'bg-amber-100  text-amber-600',
    sky:    'bg-sky-100    text-sky-600',
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">모의투자</h1>
        </div>
      </div>

      {/* 안내 배너 */}
      <div className="max-w-lg mx-auto px-5 pt-4">
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <FlaskConical size={18} className="text-violet-600" />
          </div>
          <div className="text-xs text-violet-900">
            실계좌와 완전히 분리된 연습 공간입니다. 실제 거래 데이터에는 영향이 없습니다.
          </div>
        </div>
      </div>

      <div className="px-5 pt-4 space-y-3">
        {sections.map(({ href, icon: Icon, title, desc, color }) => (
          <Link
            key={href}
            href={href}
            className="block bg-white rounded-2xl p-5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-4">
              <div
                className={`w-12 h-12 rounded-xl ${colorClasses[color]} flex items-center justify-center shrink-0`}
              >
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
