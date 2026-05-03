'use client';

import { ReactNode, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * 접고/펼치기 가능한 설정 섹션 카드.
 * - storageKey 가 있으면 localStorage 에 펼침 상태 저장
 * - 헤더 클릭으로 토글
 * - summary 는 닫혀있을 때 우측에 보이는 요약 (예: "3명", "오늘 15원")
 */
export default function CollapsibleSection({
  storageKey,
  title,
  icon,
  summary,
  defaultOpen = false,
  children,
}: {
  storageKey?: string;
  title: string;
  icon?: ReactNode;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  // hydration 안전: 첫 렌더는 SSR 동일, 마운트 후 localStorage 적용
  useEffect(() => {
    if (!storageKey) {
      setHydrated(true);
      return;
    }
    try {
      const v = localStorage.getItem(`section:${storageKey}`);
      if (v === '1') setOpen(true);
      else if (v === '0') setOpen(false);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          localStorage.setItem(`section:${storageKey}`, next ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between px-4 py-3.5 active:bg-gray-50"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="flex-shrink-0">{icon}</span>}
          <span className="font-semibold text-gray-800 text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 flex-shrink-0">
          {!open && summary && <span className="truncate max-w-[160px]">{summary}</span>}
          {open ? (
            <ChevronUp size={16} className="text-gray-400" />
          ) : (
            <ChevronDown size={16} className="text-gray-400" />
          )}
        </div>
      </button>
      {hydrated && open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-50">{children}</div>
      )}
    </section>
  );
}
