'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import { useTasks } from '@/hooks/useTasks';
import { shouldShowOnCalendar, isTaskCompletedOn } from '@/lib/task-recurrence';
import { useToday } from '@/hooks/useToday';
import { getHolidaysMap } from '@/lib/korean-holidays';
import type { Task } from '@/types';

dayjs.locale('ko');

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 위젯 풍 캘린더 — 한 화면에 이번 달 + 오늘 일정 요약.
 * Galaxy 등에서 이 URL 을 홈 화면에 별도 바로가기로 추가하면 위젯처럼 사용.
 * (PWA 표준은 네이티브 위젯을 지원하지 않음 — Add to Home Screen 으로 대체)
 */
export default function WidgetCalendarPage() {
  const [now, setNow] = useState(() => dayjs());
  const todayKey = useToday(() => setNow(dayjs()));
  const month = now.startOf('month');

  const { tasks } = useTasks({ include_completions: true });
  const { tasks: routines } = useTasks({ type: 'routine', include_completions: true });
  const all = useMemo(() => {
    const map = new Map<string, Task>();
    [...tasks, ...routines].forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [tasks, routines]);

  // 5분마다 자동 새로고침 (위젯 같은 갱신 효과)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((v) => v + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  // 셀
  const cells = useMemo(() => {
    const firstDay = month.startOf('month');
    const startWeekday = firstDay.day();
    const daysInMonth = month.daysInMonth();
    const arr: Dayjs[] = [];
    for (let i = 0; i < startWeekday; i++) {
      arr.push(month.subtract(startWeekday - i, 'day'));
    }
    for (let d = 1; d <= daysInMonth; d++) arr.push(month.date(d));
    while (arr.length % 7 !== 0) {
      const last = arr[arr.length - 1];
      arr.push(last.add(1, 'day'));
    }
    return arr;
  }, [month]);

  const holidays = useMemo(() => {
    const set = new Set<string>();
    const years = new Set<number>([month.year(), month.add(1, 'month').year()]);
    for (const y of years) {
      const m = getHolidaysMap(y);
      for (const k of Object.keys(m)) set.add(k);
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.format('YYYY-MM')]);

  // 오늘 이벤트
  const today = dayjs(todayKey);
  const todaysEvents = useMemo(() => {
    return all
      .filter((t) => shouldShowOnCalendar(t, today))
      .sort((a, b) => {
        if (a.is_fixed !== b.is_fixed) return a.is_fixed ? -1 : 1;
        return (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99');
      });
  }, [all, today]);

  // 셀별 task 개수
  const countsByDate = useMemo(() => {
    const map: Record<string, { count: number; done: number }> = {};
    for (const cell of cells) {
      const key = cell.format('YYYY-MM-DD');
      const list = all.filter((t) => shouldShowOnCalendar(t, cell));
      const done = list.filter((t) => isTaskCompletedOn(t, cell)).length;
      map[key] = { count: list.length, done };
    }
    return map;
  }, [cells, all]);

  return (
    <div className="min-h-screen bg-white p-3 select-none">
      {/* 헤더 */}
      <div className="flex items-baseline justify-between mb-2">
        <Link
          href="/todo/calendar"
          className="text-base font-bold text-gray-900 active:text-amber-600"
        >
          {month.format('YYYY년 M월')} <span className="text-xs text-gray-400">›</span>
        </Link>
        <span className="text-[10px] text-gray-400">
          {dayjs().format('HH:mm')} 갱신
        </span>
      </div>

      {/* 미니 캘린더 */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden mb-3 text-[10px]">
        {DOW.map((d, i) => (
          <div
            key={d}
            className={`bg-gray-50 text-center py-1 font-semibold ${
              i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const key = cell.format('YYYY-MM-DD');
          const isThisMonth = cell.month() === month.month();
          const isToday = key === todayKey;
          const isHoliday = holidays.has(key);
          const dow = cell.day();
          const data = countsByDate[key];
          const total = data?.count ?? 0;
          const done = data?.done ?? 0;
          const undone = total - done;
          return (
            <Link
              key={key}
              href={`/todo/day?date=${key}`}
              className={`bg-white aspect-square flex flex-col items-center justify-center relative active:bg-gray-50 ${
                !isThisMonth ? 'opacity-40' : ''
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${
                  isToday
                    ? 'w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center'
                    : isHoliday || dow === 0
                      ? 'text-rose-500'
                      : dow === 6
                        ? 'text-blue-500'
                        : 'text-gray-700'
                }`}
              >
                {cell.date()}
              </span>
              {total > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {undone > 0 && (
                    <span className="w-1 h-1 rounded-full bg-amber-500" />
                  )}
                  {done > 0 && (
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                  {total > 2 && (
                    <span className="text-[8px] text-gray-400 leading-none">
                      +{total}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* 오늘 일정 요약 */}
      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-bold text-gray-700">
            오늘 {dayjs(todayKey).format('M/D (ddd)')} · {todaysEvents.length}건
          </span>
          <Link
            href="/todo"
            className="text-[10px] text-amber-600 font-semibold active:underline"
          >
            전체 보기 ›
          </Link>
        </div>
        {todaysEvents.length === 0 ? (
          <div className="text-[11px] text-gray-400 py-3 text-center bg-gray-50 rounded-lg">
            오늘 일정 없음
          </div>
        ) : (
          todaysEvents.slice(0, 5).map((t) => {
            const completed = isTaskCompletedOn(t, today);
            return (
              <Link
                key={t.id}
                href={`/todo/day?date=${todayKey}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 active:bg-gray-100 ${
                  completed ? 'opacity-50' : ''
                }`}
              >
                {t.is_fixed && t.due_time && (
                  <span className="text-[10px] tabular-nums text-amber-700 font-bold w-9">
                    {(t.due_time as string).slice(0, 5)}
                  </span>
                )}
                <span
                  className={`text-xs flex-1 truncate ${
                    completed ? 'line-through text-gray-400' : 'text-gray-800'
                  }`}
                >
                  {t.title}
                </span>
                {t.member && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: t.member.color }}
                  />
                )}
              </Link>
            );
          })
        )}
        {todaysEvents.length > 5 && (
          <div className="text-[10px] text-gray-400 text-center pt-1">
            +{todaysEvents.length - 5}건 더
          </div>
        )}
      </div>

      {/* 작은 안내 */}
      <p className="text-[9px] text-gray-300 mt-3 text-center">
        💡 이 페이지를 홈 화면에 추가하면 위젯처럼 사용할 수 있어요
      </p>
    </div>
  );
}
