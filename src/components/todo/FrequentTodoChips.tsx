'use client';

import { useMemo, useState } from 'react';
import { Zap } from 'lucide-react';
import dayjs from 'dayjs';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 자주 쓰는 할일 타이틀 칩 행.
 * - 기존 todo 중 같은 title 빈도 상위 N개 노출 (한 번이라도 반복된 것만)
 * - 칩 클릭 → 그 title 로 즉시 새 todo 생성 (오늘 마감)
 */
export default function FrequentTodoChips({
  todos,
  onCreated,
  limit = 6,
  memberId,
}: {
  todos: Task[];
  onCreated: () => void;
  limit?: number;
  memberId?: string;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const frequent = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of todos) {
      const key = t.title.trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    // 1회 초과만 (즉, 2회 이상 등록한 적 있는 것)
    const arr = Array.from(map.entries())
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([title]) => title);
    return arr;
  }, [todos, limit]);

  if (frequent.length === 0) return null;

  const quickAdd = async (title: string) => {
    if (busy) return;
    setBusy(title);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          kind: 'todo',
          type: 'one_time',
          title,
          deadline_date: today,
          priority: 'normal',
          member_id: memberId ?? null,
        }),
      });
      onCreated();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 scrollbar-hide">
      <div className="shrink-0 inline-flex items-center gap-1 text-[11px] text-gray-500 px-2 py-1.5">
        <Zap size={11} className="text-amber-500" />
        자주
      </div>
      {frequent.map((title) => (
        <button
          key={title}
          type="button"
          onClick={() => quickAdd(title)}
          disabled={busy === title}
          className="shrink-0 px-3 py-1.5 rounded-full bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-200 text-amber-700 text-xs font-medium disabled:opacity-50"
          title={`'${title}' 즉시 등록 (오늘 마감)`}
        >
          {busy === title ? '추가 중…' : `+ ${title}`}
        </button>
      ))}
    </div>
  );
}
