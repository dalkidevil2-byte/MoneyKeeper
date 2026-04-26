'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import TaskCard from '@/components/todo/TaskCard';
import NotificationBell from '@/components/todo/NotificationBell';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import { useTodayTasks, useCompleteTask } from '@/hooks/useTasks';
import { useMembers } from '@/hooks/useAccounts';
import type { Task, TodayTask } from '@/types';

dayjs.locale('ko');

export default function TodoHomePage() {
  const { members } = useMembers();
  const [memberFilter, setMemberFilter] = useState<string | ''>('');
  const { data, loading, refetch } = useTodayTasks(memberFilter || undefined);

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

  const today = dayjs().format('YYYY년 M월 D일 dddd');
  const todayKey = dayjs().format('YYYY-MM-DD');

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
    setSheetOpen(true);
  };
  const openCreate = () => {
    setEditing(null);
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
          <NotificationBell />
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

        {/* 오늘 */}
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">⭐ 오늘</h2>
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">불러오는 중…</div>
          ) : todayList.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              오늘 할일이 없어요. <br />
              <span className="text-xs">+ 버튼으로 추가해보세요</span>
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
        occurrenceDate={todayKey}
      />
    </div>
  );
}
