'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/ko';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Plus,
} from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import { useMembers } from '@/hooks/useAccounts';
import { shouldShowOnCalendar, isTaskCompletedOn } from '@/lib/task-recurrence';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import type { Task } from '@/types';

dayjs.locale('ko');

const DEFAULT_COLOR = '#94a3b8';
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export default function TodoWeekPage() {
  const sp = useSearchParams();
  const initialDate = sp.get('date') ?? dayjs().format('YYYY-MM-DD');

  const [anchor, setAnchor] = useState<Dayjs>(() => dayjs(initialDate));
  const weekStart = anchor.startOf('week'); // 일요일 기준
  const weekEnd = weekStart.add(6, 'day');

  const { members } = useMembers();
  const { tasks, refetch: refetchTasks } = useTasks({ include_completions: true });
  const { tasks: routines, refetch: refetchRoutines } = useTasks({
    type: 'routine',
    include_completions: true,
  });
  const refetch = () => {
    refetchTasks();
    refetchRoutines();
  };

  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // 클릭한 날짜

  const allTasks = useMemo(() => {
    const map = new Map<string, Task>();
    [...tasks, ...routines].forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [tasks, routines]);

  const memberColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.id, mem.color);
    return m;
  }, [members]);

  const getTaskColor = (t: Task): string => {
    if (t.target_member_ids && t.target_member_ids.length > 0) {
      return memberColorMap.get(t.target_member_ids[0]) ?? DEFAULT_COLOR;
    }
    if (t.member_id) return memberColorMap.get(t.member_id) ?? DEFAULT_COLOR;
    return DEFAULT_COLOR;
  };

  // 7일 각각 그날의 task 리스트
  const days = useMemo(() => {
    const arr: { date: Dayjs; tasks: Task[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = weekStart.add(i, 'day');
      const list = allTasks
        .filter((t) => shouldShowOnCalendar(t, d))
        .sort((a, b) => {
          if (a.is_fixed !== b.is_fixed) return a.is_fixed ? -1 : 1;
          if (a.is_fixed && b.is_fixed) {
            return (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99');
          }
          return (a.title ?? '').localeCompare(b.title ?? '');
        });
      arr.push({ date: d, tasks: list });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, weekStart.format('YYYY-MM-DD')]);

  const todayKey = dayjs().format('YYYY-MM-DD');

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">주간</h1>
        <div className="inline-flex bg-white border border-gray-200 rounded-full p-0.5 shadow-sm">
          <Link
            href={`/todo/calendar?date=${anchor.format('YYYY-MM-DD')}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-full text-gray-500 active:bg-gray-100 inline-flex items-center gap-1"
          >
            <CalendarDays size={13} /> 월
          </Link>
          <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-500 text-white inline-flex items-center gap-1">
            <CalendarRange size={13} /> 주
          </span>
          <Link
            href={`/todo/day?date=${anchor.format('YYYY-MM-DD')}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-full text-gray-500 active:bg-gray-100 inline-flex items-center gap-1"
          >
            <CalendarClock size={13} /> 일
          </Link>
        </div>
      </div>

      {/* 주 네비 */}
      <div className="px-4 flex items-center justify-between mb-3">
        <button
          onClick={() => setAnchor((a) => a.subtract(1, 'week'))}
          className="p-2 text-gray-500 active:bg-gray-100 rounded-lg"
          aria-label="이전 주"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => setAnchor(dayjs())}
          className="text-base font-bold hover:text-amber-600"
          title="이번 주로"
        >
          {weekStart.format('M월 D일')} ~ {weekEnd.format('M월 D일')}
        </button>
        <button
          onClick={() => setAnchor((a) => a.add(1, 'week'))}
          className="p-2 text-gray-500 active:bg-gray-100 rounded-lg"
          aria-label="다음 주"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 7일 큰 카드 */}
      <div className="px-3 space-y-2">
        {days.map(({ date, tasks: list }) => {
          const key = date.format('YYYY-MM-DD');
          const dow = date.day();
          const isToday = key === todayKey;
          const dowColor =
            dow === 0
              ? 'text-rose-500'
              : dow === 6
                ? 'text-blue-500'
                : 'text-gray-700';
          return (
            <div
              key={key}
              className={`bg-white rounded-2xl border ${
                isToday ? 'border-amber-300 ring-2 ring-amber-200' : 'border-gray-100'
              } overflow-hidden`}
            >
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/50 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-base font-bold ${
                      isToday
                        ? 'text-amber-600'
                        : dowColor
                    }`}
                  >
                    {date.format('M/D')} ({DOW_KO[dow]})
                  </span>
                  {isToday && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white font-semibold">
                      오늘
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{list.length}건</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCreating(key)}
                    className="p-1.5 text-indigo-500 active:bg-indigo-50 rounded-lg"
                    aria-label="추가"
                  >
                    <Plus size={16} />
                  </button>
                  <Link
                    href={`/todo/day?date=${key}`}
                    className="text-[11px] font-semibold text-amber-600 px-2 py-1 active:bg-amber-50 rounded inline-flex items-center gap-0.5"
                  >
                    일간 <ChevronRight size={11} />
                  </Link>
                </div>
              </div>
              <Link
                href={`/todo/day?date=${key}`}
                className="block px-4 py-2 active:bg-gray-50"
              >
                {list.length === 0 ? (
                  <div className="text-xs text-gray-300 py-2">일정 없음</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 py-1.5">
                    {list.slice(0, 8).map((t) => {
                      const completed = isTaskCompletedOn(t, date);
                      return (
                        <span
                          key={t.id}
                          className={`text-[11px] px-2 py-0.5 rounded text-white max-w-[140px] truncate ${
                            completed ? 'opacity-50 line-through' : ''
                          }`}
                          style={{ backgroundColor: getTaskColor(t) }}
                          title={t.title}
                        >
                          {t.is_fixed && t.due_time && (
                            <span className="opacity-80 mr-1">
                              {(t.due_time as string).slice(0, 5)}
                            </span>
                          )}
                          {t.title}
                        </span>
                      );
                    })}
                    {list.length > 8 && (
                      <span className="text-[11px] text-gray-400 px-2 py-0.5">
                        +{list.length - 8}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            </div>
          );
        })}
      </div>

      {(editing || creating) && (
        <TaskFormSheet
          open
          initial={editing ?? undefined}
          defaults={creating ? ({ due_date: creating, kind: 'event' } as Partial<Task>) : null}
          defaultDate={creating ?? undefined}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
