'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

export default function BottomNav() {
  const pathname = usePathname();

  // 허브 페이지에서는 바텀 네비 숨김
  if (pathname === '/') return null;

  // 섹션 판별: paper > stock > budget 순서로 먼저 매칭
  const isPaperSection = pathname.startsWith('/stocks/paper');
  const isStockSection = pathname.startsWith('/stocks');
  const tabs = isPaperSection ? PAPER_TABS : isStockSection ? STOCK_TABS : BUDGET_TABS;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-lg mx-auto bg-white border-t border-gray-100 flex pointer-events-auto">
        {tabs.map(({ href, icon: Icon, label }) => {
          // 섹션 홈(/budget, /stocks, /stocks/paper)은 exact match만.
          // 하위 경로가 있을 수 있는 탭은 prefix match 허용.
          const isSectionHome =
            href === '/budget' || href === '/stocks' || href === '/stocks/paper';
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
