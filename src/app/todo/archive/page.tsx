'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { Check, X as XIcon } from 'lucide-react';
import { useTasks } from '@/hooks/useTasks';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface CompletionRow {
  id: string;
  task_id: string;
  completed_on: string;
  completed_at: string;
  note: string;
  task?: { id: string; title: string; type: string };
}

export default function ArchivePage() {
  // 완료된 일회성 task
  const { tasks: doneOneTime, loading: loadingDone } = useTasks({
    type: 'one_time',
    status: 'done',
  });
  // 취소된 task
  const { tasks: cancelled, loading: loadingCancel } = useTasks({
    include_cancelled: true,
    status: 'cancelled',
  });

  // 최근 30일 루틴 완료 기록
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [loadingComp, setLoadingComp] = useState(true);

  useEffect(() => {
    const since = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    fetch(`/api/tasks?household_id=${HOUSEHOLD_ID}&type=routine`)
      .then((r) => r.json())
      .then(async (d) => {
        const routines: Task[] = d.tasks ?? [];
        const map = new Map(routines.map((r) => [r.id, r]));
        // 모든 routine completion 합치는 직접 조회는 admin RPC 없이 어렵 → 각 routine 의 detail 호출
        const all: CompletionRow[] = [];
        await Promise.all(
          routines.map(async (r) => {
            const res = await fetch(`/api/tasks/${r.id}`).then((x) => x.json());
            const cs = res?.task?.completions ?? [];
            for (const c of cs) {
              if (c.completed_on >= since) {
                all.push({ ...c, task: map.get(r.id) });
              }
            }
          })
        );
        all.sort((a, b) => b.completed_on.localeCompare(a.completed_on));
        setCompletions(all);
      })
      .finally(() => setLoadingComp(false));
  }, []);

  const loading = loadingDone || loadingCancel || loadingComp;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">기록</h1>
        <p className="text-sm text-gray-500 mt-1">최근 완료/취소한 할일</p>
      </div>

      <div className="px-5 space-y-5">
        {/* 완료한 일회성 */}
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">✅ 완료한 일회성</h2>
          {doneOneTime.length === 0 ? (
            <EmptyMsg text={loading ? '불러오는 중…' : '없음'} />
          ) : (
            <div className="space-y-2">
              {doneOneTime.map((t) => (
                <RowDone key={t.id} task={t} />
              ))}
            </div>
          )}
        </section>

        {/* 루틴 완료 기록 */}
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">🔁 루틴 완료 (30일)</h2>
          {completions.length === 0 ? (
            <EmptyMsg text={loading ? '불러오는 중…' : '없음'} />
          ) : (
            <div className="space-y-2">
              {completions.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-2xl border border-gray-100"
                >
                  <Check size={16} className="text-emerald-500" />
                  <span className="flex-1 text-sm font-medium text-gray-700 truncate">
                    {c.task?.title ?? '(삭제됨)'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {dayjs(c.completed_on).format('M/D')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 취소 */}
        {cancelled.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-400 mb-2">취소</h2>
            <div className="space-y-2 opacity-70">
              {cancelled.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-2xl border border-gray-100"
                >
                  <XIcon size={16} className="text-rose-400" />
                  <span className="flex-1 text-sm text-gray-600 line-through truncate">
                    {t.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function RowDone({ task }: { task: Task }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-2xl border border-gray-100">
      <Check size={16} className="text-emerald-500" />
      <span className="flex-1 text-sm font-medium text-gray-700 truncate">{task.title}</span>
      <span className="text-xs text-gray-400">
        {task.completed_at ? dayjs(task.completed_at).format('M/D') : ''}
      </span>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <div className="text-sm text-gray-400 py-6 text-center bg-white rounded-2xl border border-dashed border-gray-200">
      {text}
    </div>
  );
}
