'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, X, Calendar, Repeat, Target } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { Task } from '@/types';
import TaskFormSheet from '@/components/todo/TaskFormSheet';

dayjs.locale('ko');

type Group = 'all' | 'event' | 'todo' | 'routine';

export default function TodoSearchPage() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Task | null>(null);

  // 전체 task 한 번 로드 (취소/완료 포함)
  const load = async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        household_id: process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!,
        include_cancelled: '1',
      });
      const res = await fetch(`/api/tasks?${sp.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setTasks(j.tasks ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (group === 'event' && t.kind !== 'event') return false;
        if (group === 'todo' && t.kind !== 'todo') return false;
        if (group === 'routine' && t.type !== 'routine') return false;
        if (!needle) return true;
        const hay = [
          t.title,
          t.memo,
          t.category_main,
          t.category_sub,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(needle);
      })
      .sort((a, b) => {
        // 날짜 내림차순 (event 우선 due_date, todo 우선 deadline_date)
        const ad = a.due_date ?? a.deadline_date ?? a.start_date ?? '';
        const bd = b.due_date ?? b.deadline_date ?? b.start_date ?? '';
        return bd.localeCompare(ad);
      });
  }, [tasks, q, group]);

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      event: tasks.filter((t) => t.kind === 'event').length,
      todo: tasks.filter((t) => t.kind === 'todo').length,
      routine: tasks.filter((t) => t.type === 'routine').length,
    };
  }, [tasks]);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-2">
          <Link href="/todo" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="할일·일정 검색 (제목·메모·카테고리)"
              autoFocus
              className="w-full pl-9 pr-9 py-2 text-sm rounded-xl bg-gray-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder-gray-400"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 text-gray-400"
                aria-label="지우기"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {/* 필터 칩 */}
        <div className="px-4 pb-3 flex gap-1.5 overflow-x-auto">
          {(
            [
              { k: 'all', label: '전체' },
              { k: 'event', label: '일정' },
              { k: 'todo', label: '할일' },
              { k: 'routine', label: '루틴' },
            ] as const
          ).map((b) => (
            <button
              key={b.k}
              onClick={() => setGroup(b.k)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${
                group === b.k
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {b.label}{' '}
              <span
                className={
                  group === b.k ? 'opacity-80' : 'text-gray-400'
                }
              >
                {counts[b.k]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 결과 */}
      <div className="max-w-lg mx-auto px-4 pt-3 space-y-2">
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12">
            {q ? '검색 결과가 없어요' : '검색어를 입력하세요'}
          </div>
        ) : (
          <>
            <div className="text-[11px] text-gray-400 px-1">총 {filtered.length}건</div>
            {filtered.map((t) => {
              const dateLabel =
                t.kind === 'todo'
                  ? t.deadline_date
                    ? `~ ${dayjs(t.deadline_date).format('M/D')}`
                    : t.start_date
                      ? `${dayjs(t.start_date).format('M/D')} 시작`
                      : '미정'
                  : t.due_date
                    ? dayjs(t.due_date).format('M/D (ddd)')
                    : '';
              const isCancelled = t.status === 'cancelled' || !t.is_active;
              return (
                <button
                  key={t.id}
                  onClick={() => setEditing(t)}
                  className={`w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50 ${
                    isCancelled ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {t.kind === 'todo' ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 font-semibold">
                            할일
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-semibold">
                            일정
                          </span>
                        )}
                        {t.type === 'routine' && (
                          <Repeat size={11} className="text-amber-500" />
                        )}
                        {t.goal_id && <Target size={11} className="text-emerald-500" />}
                        <span
                          className={`text-sm font-semibold text-gray-900 truncate ${
                            isCancelled || t.status === 'done'
                              ? 'line-through'
                              : ''
                          }`}
                        >
                          {t.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-0.5">
                          <Calendar size={10} /> {dateLabel}
                        </span>
                        {t.due_time && (
                          <span>{(t.due_time as string).slice(0, 5)}</span>
                        )}
                        {t.category_main && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {t.category_main}
                            {t.category_sub ? ` · ${t.category_sub}` : ''}
                          </span>
                        )}
                        {isCancelled && (
                          <span className="text-rose-400">취소됨</span>
                        )}
                      </div>
                      {t.memo && (
                        <div className="text-[11px] text-gray-400 mt-1 line-clamp-2">
                          {t.memo}
                        </div>
                      )}
                    </div>
                    {t.member && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                        style={{ backgroundColor: t.member.color }}
                        title={t.member.name}
                      />
                    )}
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {editing && (
        <TaskFormSheet
          open={!!editing}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}
