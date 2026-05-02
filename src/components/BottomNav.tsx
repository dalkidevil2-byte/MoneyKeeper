'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { STOCKS_DISABLED } from '@/lib/app-flags';
import {
  Home,
  List,
  BarChart2,
  Heart,
  Settings,
  Briefcase,
  LineChart,
  Receipt,
  FlaskConical,
  Calendar,
  Repeat,
  Target,
  CheckCircle2,
  Archive,
  Plus,
} from 'lucide-react';

type Tab = {
  href: string;
  icon: typeof Home;
  label: string;
};

// 가계부 섹션 바텀 네비 (홈 = 가계부 홈 /budget)
const BUDGET_TABS: Tab[] = [
  { href: '/budget',       icon: Home,      label: '홈' },
  { href: '/transactions', icon: List,      label: '거래내역' },
  { href: '/stats',        icon: BarChart2, label: '통계' },
  { href: '/wishlist',     icon: Heart,     label: '위시리스트' },
  { href: '/settings',     icon: Settings,  label: '설정' },
];

// 주식 섹션 바텀 네비 (홈 = 주식 홈 /stocks)
const STOCK_TABS: Tab[] = [
  { href: '/stocks',              icon: Home,      label: '홈' },
  { href: '/stocks/portfolio',    icon: Briefcase, label: '포트폴리오' },
  { href: '/stocks/transactions', icon: Receipt,   label: '거래' },
  { href: '/stocks/chart',        icon: LineChart, label: '차트' },
  { href: '/stocks/settings',     icon: Settings,  label: '설정' },
];

// 모의투자 섹션 바텀 네비
const PAPER_TABS: Tab[] = [
  { href: '/stocks/paper',              icon: FlaskConical, label: '홈' },
  { href: '/stocks/paper/portfolio',    icon: Briefcase,    label: '포트폴리오' },
  { href: '/stocks/paper/transactions', icon: Receipt,      label: '거래' },
  { href: '/stocks/paper/settings',     icon: Settings,     label: '설정' },
];

// 할일 섹션 바텀 네비 (홈 = /todo)
const TODO_TABS: Tab[] = [
  { href: '/todo',          icon: Home,         label: '오늘' },
  { href: '/todo/calendar', icon: Calendar,     label: '캘린더' },
  { href: '/todo/tracks',   icon: CheckCircle2, label: 'Daily' },
  { href: '/todo/goals',    icon: Target,       label: '목표' },
  { href: '/todo/settings', icon: Settings,     label: '설정' },
];

void Archive;
void Plus;

// 루틴(기념일/연례 일정) 페이지는 설정 안 진입 링크로만 노출됨.
void Repeat;


export default function BottomNav() {
  const pathname = usePathname();

  // 허브, 아카이브, 어시스턴트는 바텀 네비 숨김 (하위 섹션 없음)
  if (pathname === '/') return null;
  if (pathname.startsWith('/archive')) return null;
  if (pathname.startsWith('/assistant')) return null;
  // 주식 비활성 시: /stocks 경로 진입해도 가계부 네비 표시 (안 보이게 처리)
  if (STOCKS_DISABLED && pathname.startsWith('/stocks')) return null;

  // 섹션 판별: paper > stock > todo > budget 순서로 먼저 매칭
  const isPaperSection = pathname.startsWith('/stocks/paper');
  const isStockSection = pathname.startsWith('/stocks');
  const isTodoSection = pathname.startsWith('/todo');
  const tabs = isPaperSection
    ? PAPER_TABS
    : isStockSection
      ? STOCK_TABS
      : isTodoSection
        ? TODO_TABS
        : BUDGET_TABS;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-lg mx-auto bg-white border-t border-gray-100 flex pointer-events-auto">
        {tabs.map(({ href, icon: Icon, label }) => {
          // 섹션 홈(/budget, /stocks, /stocks/paper)은 exact match만.
          // 하위 경로가 있을 수 있는 탭은 prefix match 허용.
          const isSectionHome =
            href === '/budget' ||
            href === '/stocks' ||
            href === '/stocks/paper' ||
            href === '/todo';
          const active = isSectionHome
            ? pathname === href
            : pathname === href || pathname.startsWith(href + '/');

          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>
                {label}
              </span>
              {active && <span className="w-1 h-1 rounded-full bg-indigo-600 -mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
