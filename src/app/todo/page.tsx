'use client';

import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import TaskCard from '@/components/todo/TaskCard';
import NotificationBell from '@/components/todo/NotificationBell';
import QuickInputBar from '@/components/todo/QuickInputBar';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import DailyTrackDetailSheet from '@/components/todo/DailyTrackDetailSheet';
import { useTodayTasks, useCompleteTask, useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { useMembers } from '@/hooks/useAccounts';
import type { Task, TodayTask, DailyTrack } from '@/types';
import { DAILY_TRACK_PERIOD_LABELS } from '@/types';

dayjs.locale('ko');

export default function TodoHomePage() {
  const { members } = useMembers();
  const [memberFilter, setMemberFilter] = useState<string | ''>('');
  const { data, loading, refetch: refetchToday } = useTodayTasks(memberFilter || undefined);
  // todo 리스트 — pending + done 모두 (취소선 표시 위해)
  const { tasks: todoTasks, refetch: refetchTodos } = useTasks({
    kind: 'todo',
    member_id: memberFilter || undefined,
  });
  // Daily Track Record
  const [dailyTracks, setDailyTracks] = useState<DailyTrack[]>([]);
  const [trackDetailId, setTrackDetailId] = useState<string | null>(null);
  const refetchTracks = () => {
    const sp = new URLSearchParams({
      household_id: process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!,
    });
    if (memberFilter) sp.set('member_id', memberFilter);
    fetch(`/api/daily-tracks?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setDailyTracks(d.tracks ?? []));
  };
  useEffect(() => {
    refetchTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberFilter]);

  const refetch = () => {
    refetchToday();
    refetchTodos();
    refetchTracks();
  };

  const checkTrack = async (t: DailyTrack) => {
    await fetch(`/api/daily-tracks/${t.id}/check`, { method: 'POST' });
    refetchTracks();
  };
  const uncheckTrack = async (t: DailyTrack) => {
    await fetch(`/api/daily-tracks/${t.id}/check`, { method: 'DELETE' });
    refetchTracks();
  };

  // 진입 시 노션 자동 sync (30분 throttle 은 서버에서)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/todo/notion-sources/auto-sync', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        // 변경이 있었으면 refetch
        const hasChange = (d.results ?? []).some(
          (r: {
            status: string;
            counts?: { inserted?: number; removed?: number; updated?: number };
          }) =>
            r.status === 'ok' &&
            ((r.counts?.inserted ?? 0) > 0 ||
              (r.counts?.removed ?? 0) > 0 ||
              (r.counts?.updated ?? 0) > 0),
        );
        if (hasChange) refetch();
      })
      .catch(() => {
        /* 네트워크 오류 무시 */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { complete, uncomplete } = useCompleteTask();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [sheetDefaults, setSheetDefaults] = useState<Partial<Task> | null>(null);

  // 자정 자동 갱신 — 날짜가 넘어가면 데이터 refetch + 표시 업데이트
  const todayKey = useToday(() => {
    refetch();
  });
  const today = dayjs(todayKey).format('YYYY년 M월 D일 dddd');

  const handleToggle = async (item: TodayTask) => {
    try {
      if (item.completed_today) {
        await uncomplete(item.task.id, todayKey);
      } else {
        await complete(item.task.id, todayKey, memberFilter || null);
      }
      refetch();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '처리 실패');
    }
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setSheetDefaults(null);
    setSheetOpen(true);
  };
  const openCreate = () => {
    setEditing(null);
    setSheetDefaults(null);
    setSheetOpen(true);
  };
  const openWithDefaults = (defaults: Partial<Task>) => {
    setEditing(null);
    setSheetDefaults(defaults);
    setSheetOpen(true);
  };

  const todayList = data?.today ?? [];
  const overdueList = data?.overdue ?? [];
  const totalToday = data?.counts.today_total ?? 0;
  const doneToday = data?.counts.today_done ?? 0;
  const progress = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs text-gray-500">{today}</div>
            <h1 className="text-2xl font-bold text-gray-900 mt-1">오늘의 할일</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/todo/search"
              className="p-2 rounded-full hover:bg-amber-100 text-gray-600"
              aria-label="검색"
              title="검색"
            >
              <Search size={18} />
            </Link>
            <NotificationBell />
          </div>
        </div>

        {/* 자연어/음성 빠른 입력 */}
        <div className="mt-3">
          <QuickInputBar
            onPrefillForm={openWithDefaults}
            onSavedDirectly={refetch}
          />
        </div>

        {/* 진행률 */}
        <div className="mt-4 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm">
          <div className="flex items-baseline justify-between">
            <div className="text-sm text-gray-600">
              <span className="text-amber-600 font-bold">{doneToday}</span>
              <span className="text-gray-400"> / {totalToday}</span>
              <span className="ml-2">완료</span>
            </div>
            <div className="text-xs text-gray-400">
              {overdueList.length > 0 && <span className="text-rose-500 font-semibold mr-2">지난 {overdueList.length}건</span>}
              {progress}%
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 멤버 필터 */}
        {members.length > 0 && (
          <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1">
            <button
              onClick={() => setMemberFilter('')}
              className={`shrink-0 px-3 py-1.5 text-xs rounded-full border ${
                memberFilter === ''
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              전체
            </button>
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => setMemberFilter(m.id)}
                className={`shrink-0 px-3 py-1.5 text-xs rounded-full border inline-flex items-center gap-1.5 ${
                  memberFilter === m.id
                    ? 'border-gray-800 bg-gray-50 text-gray-800 font-semibold'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                {m.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="px-5 space-y-5">
        {/* 지난 */}
        {overdueList.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-rose-500 mb-2">🔴 지난</h2>
            <div className="space-y-2">
              {overdueList.map((item) => (
                <TaskCard
                  key={item.task.id}
                  item={item}
                  onToggle={() => handleToggle(item)}
                  onClick={() => openEdit(item.task)}
                  showOverdue
                />
              ))}
            </div>
          </section>
        )}

        {/* 오늘 일정 (event) */}
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">📅 오늘의 일정</h2>
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">불러오는 중…</div>
          ) : todayList.length === 0 ? (
            <div className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              오늘 일정이 없어요.
            </div>
          ) : (
            <div className="space-y-2">
              {todayList.map((item) => (
                <TaskCard
                  key={`${item.task.id}-${item.occurrence_date}`}
                  item={item}
                  onToggle={() => handleToggle(item)}
                  onClick={() => openEdit(item.task)}
                />
              ))}
            </div>
          )}
        </section>

        {/* 할일 (todo) — 기한 임박순 */}
        <TodoSection
          todos={todoTasks}
          onClick={openEdit}
          onToggleComplete={async (t) => {
            if (t.status === 'done') {
              // 완료 취소 (오늘 날짜 기준)
              await fetch(`/api/tasks/${t.id}/complete`, { method: 'DELETE' });
            } else {
              await fetch(`/api/tasks/${t.id}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
            }
            refetch();
          }}
        />

        {/* Daily Track Record — 오늘 활성화된 항목만 */}
        {dailyTracks.filter((t) => t.is_active_today !== false).length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-700 mb-2">
              📌 Daily Track (
              {
                dailyTracks.filter(
                  (t) => t.is_active_today !== false && t.is_done_today,
                ).length
              }
              /{dailyTracks.filter((t) => t.is_active_today !== false).length})
            </h2>
            <div className="space-y-1.5">
              {dailyTracks
                .filter((t) => t.is_active_today !== false)
                .map((t) => (
                <DailyTrackRow
                  key={t.id}
                  track={t}
                  onCheck={() => checkTrack(t)}
                  onUncheck={() => uncheckTrack(t)}
                  onClick={() => setTrackDetailId(t.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <TaskFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refetch}
        initial={editing}
        defaults={sheetDefaults}
        occurrenceDate={todayKey}
      />

      {trackDetailId && (
        <DailyTrackDetailSheet
          trackId={trackDetailId}
          onClose={() => setTrackDetailId(null)}
          onChanged={refetchTracks}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// TodoSection — kind='todo' 인 할일 리스트 (deadline 임박순)
// ─────────────────────────────────────────
function TodoSection({
  todos,
  onClick,
  onToggleComplete,
}: {
  todos: Task[];
  onClick: (t: Task) => void;
  onToggleComplete: (t: Task) => Promise<void>;
}) {
  const today = dayjs().startOf('day');

  // 모든 미완료 할일을 노출 (시작일 미래여도 보이게 — 사용자가 "있는 줄도 모르는" 상황 방지)
  // pending 과 done 분리 — done 은 맨 아래 별도 섹션
  const pending = todos.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const done = todos.filter((t) => t.status === 'done');

  // pending 만 deadline 그룹핑
  const groups: Record<string, Task[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    week: [],
    later: [],
    none: [],
  };
  for (const t of pending) {
    if (!t.deadline_date) {
      groups.none.push(t);
      continue;
    }
    const d = dayjs(t.deadline_date).startOf('day');
    const diff = d.diff(today, 'day');
    if (diff < 0) groups.overdue.push(t);
    else if (diff === 0) groups.today.push(t);
    else if (diff === 1) groups.tomorrow.push(t);
    else if (diff <= 7) groups.week.push(t);
    else groups.later.push(t);
  }
  const sorter = (a: Task, b: Task) => {
    const da = a.deadline_date ?? '';
    const db = b.deadline_date ?? '';
    if (da !== db) return da.localeCompare(db);
    return (a.deadline_time ?? '').localeCompare(b.deadline_time ?? '');
  };
  for (const k of Object.keys(groups)) groups[k].sort(sorter);
  // done 은 완료 시각 최근순
  done.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  const total = pending.length + done.length;

  return (
    <section>
      <h2 className="text-sm font-bold text-gray-700 mb-2">
        ✅ 할일 ({pending.length}
        {done.length > 0 && <span className="text-gray-400"> · 완료 {done.length}</span>})
      </h2>
      {total === 0 ? (
        <div className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-dashed border-gray-200">
          할일이 없어요.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.overdue.length > 0 && (
            <TodoGroup label="🔴 지난 기한" tasks={groups.overdue} onClick={onClick} onToggleComplete={onToggleComplete} danger />
          )}
          {groups.today.length > 0 && (
            <TodoGroup label="오늘 마감" tasks={groups.today} onClick={onClick} onToggleComplete={onToggleComplete} />
          )}
          {groups.tomorrow.length > 0 && (
            <TodoGroup label="내일 마감" tasks={groups.tomorrow} onClick={onClick} onToggleComplete={onToggleComplete} />
          )}
          {groups.week.length > 0 && (
            <TodoGroup label="이번 주 안에" tasks={groups.week} onClick={onClick} onToggleComplete={onToggleComplete} />
          )}
          {groups.later.length > 0 && (
            <TodoGroup label="이후" tasks={groups.later} onClick={onClick} onToggleComplete={onToggleComplete} />
          )}
          {groups.none.length > 0 && (
            <TodoGroup label="기한 없음" tasks={groups.none} onClick={onClick} onToggleComplete={onToggleComplete} muted />
          )}
          {done.length > 0 && (
            <TodoGroup label="완료" tasks={done} onClick={onClick} onToggleComplete={onToggleComplete} muted />
          )}
        </div>
      )}
    </section>
  );
}

function formatMinutes(m: number): string {
  if (m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}분`;
  if (min === 0) return `${h}시간`;
  return `${h}시간 ${min}분`;
}

function TodoGroup({
  label,
  tasks,
  onClick,
  onToggleComplete,
  danger,
  muted,
}: {
  label: string;
  tasks: Task[];
  onClick: (t: Task) => void;
  onToggleComplete: (t: Task) => Promise<void>;
  danger?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-[11px] font-bold mb-1 px-1 ${
          danger ? 'text-rose-500' : muted ? 'text-gray-400' : 'text-amber-600'
        }`}
      >
        {label}
      </div>
      <div className="space-y-1.5">
        {tasks.map((t) => {
          const done = t.status === 'done';
          return (
            <div
              key={t.id}
              onClick={() => onClick(t)}
              className={`flex items-center gap-3 px-3 py-2.5 bg-white rounded-2xl border border-gray-100 active:scale-[0.99] ${done ? 'opacity-60' : ''}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onToggleComplete(t);
                }}
                className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  done
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-gray-300 hover:border-amber-400 bg-white'
                }`}
                aria-label={done ? '완료 취소' : '완료'}
              >
                {done && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 7.5L6 10.5L11 4.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold truncate ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}
                >
                  {t.title}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-2">
                  {t.deadline_date && (
                    <span className={!done && danger ? 'text-rose-500 font-bold' : ''}>
                      📌
                      {t.start_date && t.start_date !== t.deadline_date
                        ? ` ${dayjs(t.start_date).format('M/D')}~${dayjs(t.deadline_date).format('M/D')}`
                        : ` ${dayjs(t.deadline_date).format('M/D')}`}
                      {t.deadline_time ? ` ${t.deadline_time.slice(0, 5)}` : ''}
                    </span>
                  )}
                  {done && t.completed_at && (
                    <span className="text-emerald-500">
                      ✓ {dayjs(t.completed_at).format('M/D HH:mm')}
                    </span>
                  )}
                  {t.checklist_summary && t.checklist_summary.total > 0 && (
                    <span className="text-indigo-500 font-semibold">
                      ☑ {t.checklist_summary.done}/{t.checklist_summary.total}
                      {t.checklist_summary.total_minutes > 0
                        ? ` · ⏱ ${formatMinutes(t.checklist_summary.total_minutes)}`
                        : ''}
                    </span>
                  )}
                  {(t.session_total_minutes ?? 0) > 0 && (
                    <span className="text-amber-600 font-semibold">
                      🕐 {formatMinutes(t.session_total_minutes!)}
                      {t.estimated_minutes != null && t.estimated_minutes > 0 && (
                        <span className="text-gray-400 font-normal">
                          {' '}/ 예상 {formatMinutes(t.estimated_minutes)}
                        </span>
                      )}
                    </span>
                  )}
                  {(t.session_total_minutes ?? 0) === 0 &&
                    t.estimated_minutes != null &&
                    t.estimated_minutes > 0 && (
                      <span className="text-indigo-500 font-semibold">
                        🎯 예상 {formatMinutes(t.estimated_minutes)}
                      </span>
                    )}
                  {t.category_main && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                      {t.category_main}
                    </span>
                  )}
                </div>
              </div>
              {t.member && (
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: t.member.color }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyTrackRow({
  track,
  onCheck,
  onUncheck,
  onClick,
}: {
  track: DailyTrack;
  onCheck: () => void;
  onUncheck: () => void;
  onClick?: () => void;
}) {
  const cur = track.current_count ?? 0;
  const tgt = track.target_count;
  const allDone = cur >= tgt;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 bg-white rounded-2xl border border-gray-100 cursor-pointer ${allDone ? 'opacity-60' : ''}`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          allDone ? onUncheck() : onCheck();
        }}
        className={`shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
          allDone
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : cur > 0
              ? 'bg-amber-100 border-amber-400 text-amber-700'
              : 'border-gray-300 text-transparent hover:border-amber-400'
        }`}
        aria-label={allDone ? '취소' : '체크'}
      >
        {allDone ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M3 7.5L6 10.5L11 4.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : cur > 0 ? (
          <span>
            {cur}/{tgt}
          </span>
        ) : (
          <span>·</span>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-base leading-none">{track.emoji || '✅'}</span>
          <span
            className={`text-sm font-semibold truncate ${allDone ? 'line-through text-gray-400' : 'text-gray-800'}`}
          >
            {track.title}
          </span>
        </div>
        <div className="text-[10px] text-gray-500 mt-0.5">
          {DAILY_TRACK_PERIOD_LABELS[track.period_unit]} {track.target_count}회
        </div>
      </div>
      {cur > 0 && !allDone && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCheck();
          }}
          className="text-[11px] px-2 py-1 rounded bg-amber-500 text-white font-bold"
        >
          +1
        </button>
      )}
      {track.member && (
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: track.member.color }}
        />
      )}
    </div>
  );
}
