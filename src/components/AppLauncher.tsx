'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Grid3x3,
  X,
  Home,
  ListTodo,
  Wallet,
  TrendingUp,
  ChevronRight,
  Sparkles,
  Archive,
} from 'lucide-react';

type Section = {
  href: string;
  icon: typeof Home;
  label: string;
  desc: string;
  bg: string;
  iconColor: string;
};

const SECTIONS: Section[] = [
  {
    href: '/',
    icon: Home,
    label: 'My Assistant',
    desc: '전체 홈',
    bg: 'bg-gray-100',
    iconColor: 'text-gray-700',
  },
  {
    href: '/assistant',
    icon: Sparkles,
    label: 'AI 어시스턴트',
    desc: '자연어 질문 · 인사이트',
    bg: 'bg-violet-100',
    iconColor: 'text-violet-600',
  },
  {
    href: '/todo',
    icon: ListTodo,
    label: '할일',
    desc: '오늘 · 캘린더 · 목표 · Daily Track',
    bg: 'bg-amber-100',
    iconColor: 'text-amber-600',
  },
  {
    href: '/budget',
    icon: Wallet,
    label: '가계부',
    desc: '거래 · 예산 · 통계 · 위시리스트',
    bg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
  },
  {
    href: '/stocks',
    icon: TrendingUp,
    label: '주식',
    desc: '포트폴리오 · 거래 · 모의투자',
    bg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
  },
  {
    href: '/archive',
    icon: Archive,
    label: '아카이브',
    desc: '일기 · 레시피 · 독서 · 자유 컬렉션',
    bg: 'bg-slate-100',
    iconColor: 'text-slate-700',
  },
];

/**
 * 전역 앱 런처 — 우상단 floating 버튼.
 * 모든 페이지에서 다른 섹션으로 빠르게 이동.
 * 허브(/) 와 /login 에서는 숨김.
 */
export default function AppLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // 허브/로그인에서는 안 보임
  if (pathname === '/' || pathname === '/login') return null;

  return (
    <>
      {/* 우상단 floating 버튼 */}
      <button
        onClick={() => setOpen(true)}
        className="fixed top-3 right-3 z-30 w-10 h-10 rounded-full bg-white shadow-md border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-50"
        aria-label="앱 메뉴"
        title="앱 메뉴"
      >
        <Grid3x3 size={18} />
      </button>

      {/* 시트 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
              <h3 className="text-base font-bold text-gray-900">앱 메뉴</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100"
                aria-label="닫기"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="px-4 pb-6 space-y-2 overflow-y-auto">
              {SECTIONS.map(({ href, icon: Icon, label, desc, bg, iconColor }) => {
                const isCurrent =
                  href === '/' ? pathname === '/' : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-2xl p-4 border transition-colors ${
                      isCurrent
                        ? 'bg-indigo-50 border-indigo-200'
                        : 'bg-white border-gray-100 active:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}
                      >
                        <Icon size={22} className={iconColor} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-900">{label}</h4>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-semibold">
                              현재
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{desc}</p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
