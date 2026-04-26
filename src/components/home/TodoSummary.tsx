'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export default function TodoSummary() {
  const [eventTotal, setEventTotal] = useState(0);
  const [eventDone, setEventDone] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [todoCount, setTodoCount] = useState(0); // 미완료 + 오늘 활성 (시작일 도래)
  const [todoOverdue, setTodoOverdue] = useState(0);
  const [trackTotal, setTrackTotal] = useState(0);
  const [trackDone, setTrackDone] = useState(0);
  const [previewTitles, setPreviewTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    Promise.all([
      // 1) 오늘 일정 (event)
      fetch(`/api/tasks/today?household_id=${HOUSEHOLD_ID}`).then((r) => r.json()),
      // 2) 미완료 할일 (todo, pending)
      fetch(
        `/api/tasks?household_id=${HOUSEHOLD_ID}&kind=todo&status=pending`,
      ).then((r) => r.json()),
      // 3) Daily Track
      fetch(`/api/daily-tracks?household_id=${HOUSEHOLD_ID}`).then((r) => r.json()),
    ])
      .then(([today, todos, tracks]) => {
        setEventTotal(today?.counts?.today_total ?? 0);
        setEventDone(today?.counts?.today_done ?? 0);
        setOverdue(today?.counts?.overdue ?? 0);

        const todoList = (todos?.tasks ?? []) as Array<{
          title: string;
          deadline_date: string | null;
        }>;
        let tdCount = 0;
        let tdOverdue = 0;
        for (const t of todoList) {
          tdCount++;
          if (t.deadline_date && t.deadline_date < todayStr) tdOverdue++;
        }
        setTodoCount(tdCount);
        setTodoOverdue(tdOverdue);

        const trackList = (tracks?.tracks ?? []) as Array<{
          title: string;
          is_done_today?: boolean;
          is_active_today?: boolean;
        }>;
        const activeTracks = trackList.filter((t) => t.is_active_today !== false);
        setTrackTotal(activeTracks.length);
        setTrackDone(activeTracks.filter((t) => t.is_done_today).length);

        // 미리보기: 오늘 일정 미완료 → 오늘 마감 todo → DTR 미완료 순
        const titles: string[] = [];
        for (const item of (today?.today ?? []) as Array<{
          task: { title: string };
          completed_today: boolean;
        }>) {
          if (!item.completed_today && titles.length < 3) titles.push(item.task.title);
        }
        if (titles.length < 3) {
          for (const t of todoList) {
            if (titles.length >= 3) break;
            if (!t.deadline_date || t.deadline_date <= todayStr) titles.push(t.title);
          }
        }
        setPreviewTitles(titles);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400">
        불러오는 중…
      </div>
    );
  }

  const eventRemaining = Math.max(0, eventTotal - eventDone);
  const trackRemaining = Math.max(0, trackTotal - trackDone);
  const totalAll = eventTotal + todoCount + trackTotal;
  const remainingAll = eventRemaining + todoCount + trackRemaining;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-baseline justify-between text-sm">
        <div>
          {totalAll === 0 ? (
            <span className="text-gray-400">오늘 할 일이 없어요</span>
          ) : (
            <>
              <span className="font-bold text-amber-600">남은 {remainingAll}건</span>
              <span className="text-gray-400"> / 총 {totalAll}건</span>
            </>
          )}
        </div>
        {(overdue > 0 || todoOverdue > 0) && (
          <span className="text-xs text-rose-500 font-semibold">
            지난 {overdue + todoOverdue}건
          </span>
        )}
      </div>
      {totalAll > 0 && (
        <div className="mt-1 text-[11px] text-gray-500 flex flex-wrap gap-x-2">
          {eventTotal > 0 && (
            <span>
              📅 {eventDone}/{eventTotal}
            </span>
          )}
          {todoCount > 0 && <span>✅ {todoCount}</span>}
          {trackTotal > 0 && (
            <span>
              📌 {trackDone}/{trackTotal}
            </span>
          )}
        </div>
      )}
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
