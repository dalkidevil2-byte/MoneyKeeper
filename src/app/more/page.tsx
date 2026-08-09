'use client';

import Link from 'next/link';
import {
  Heart, RepeatIcon, CreditCard, Settings, PiggyBank, ChevronRight, Home,
} from 'lucide-react';

type Entry = {
  href: string;
  icon: typeof Heart;
  label: string;
  desc: string;
  bg: string;
  color: string;
};

const ENTRIES: Entry[] = [
  {
    href: '/wishlist',
    icon: Heart,
    label: '위시리스트',
    desc: '사고 싶은 것 모아두기',
    bg: 'bg-rose-100',
    color: 'text-rose-500',
  },
  {
    href: '/budget/fixed-expenses',
    icon: RepeatIcon,
    label: '고정지출 관리',
    desc: '매달 반복되는 지출 템플릿',
    bg: 'bg-orange-100',
    color: 'text-orange-500',
  },
  {
    href: '/budget/card-statements',
    icon: CreditCard,
    label: '카드 청구서',
    desc: '신용카드 청구 예정·결제 확인',
    bg: 'bg-blue-100',
    color: 'text-blue-500',
  },
  {
    href: '/settings',
    icon: PiggyBank,
    label: '예산 설정',
    desc: '전체·카테고리별 월 예산',
    bg: 'bg-emerald-100',
    color: 'text-emerald-600',
  },
  {
    href: '/settings',
    icon: Settings,
    label: '설정',
    desc: '계좌 · 카드 · 구성원 · 카테고리',
    bg: 'bg-slate-100',
    color: 'text-slate-600',
  },
];

export default function MorePage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white border-b border-gray-100 px-4 pt-5 pb-3 flex items-center gap-3">
        <Link href="/" className="p-2 -ml-2 rounded-xl active:bg-gray-100">
          <Home size={18} className="text-gray-500" />
        </Link>
        <h1 className="text-lg font-bold text-gray-900">더보기</h1>
      </div>

      <div className="px-4 py-4 space-y-2">
        {ENTRIES.map(({ href, icon: Icon, label, desc, bg, color }) => (
          <Link
            key={label}
            href={href}
            className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3.5 active:bg-gray-50 transition-colors"
          >
            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
