'use client';

import { useEffect, useState } from 'react';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface TodayResp {
  today: { task: { id: string; title: string }; completed_today: boolean }[];
  overdue: { task: { id: string } }[];
  counts: { today_total: number; today_done: number; overdue: number };
}

export default function TodoSummary() {
  const [data, setData] = useState<TodayResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tasks/today?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        불러오는 중…
      </div>
    );
  }

  const total = data?.counts.today_total ?? 0;
  const done = data?.counts.today_done ?? 0;
  const remaining = total - done;
  const overdue = data?.counts.overdue ?? 0;
  const previewTitles = (data?.today ?? [])
    .filter((t) => !t.completed_today)
    .slice(0, 3)
    .map((t) => t.task.title);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-baseline justify-between text-sm">
        <div>
          {total === 0 ? (
            <span className="text-gray-400">오늘 할일이 없어요</span>
          ) : (
            <>
              <span className="font-bold text-amber-600">남은 {remaining}건</span>
              <span className="text-gray-400"> / 오늘 {total}건</span>
            </>
          )}
        </div>
        {overdue > 0 && (
          <span className="text-xs text-rose-500 font-semibold">지난 {overdue}건</span>
        )}
      </div>
      {previewTitles.length > 0 && (
        <div className="mt-1.5 text-xs text-gray-500 truncate">
          {previewTitles.map((t, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
