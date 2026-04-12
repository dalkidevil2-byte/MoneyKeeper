'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, List, BarChart2, Settings, Heart } from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: '/',             icon: Home,      label: '홈' },
    { href: '/transactions', icon: List,      label: '거래내역' },
    { href: '/stats',        icon: BarChart2, label: '통계' },
    { href: '/wishlist',     icon: Heart,     label: '위시리스트' },
    { href: '/settings',     icon: Settings,  label: '설정' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
      <div className="max-w-lg mx-auto bg-white border-t border-gray-100 flex pointer-events-auto">
        {tabs.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center pt-3 pb-4 gap-1 transition-colors ${
                active ? 'text-indigo-600' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
              <span className={`text-xs ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              {active && <span className="w-1 h-1 rounded-full bg-indigo-600 -mt-0.5" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
