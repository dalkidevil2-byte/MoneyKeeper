'use client';

import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { CheckCircle2, Circle, Calendar } from 'lucide-react';

interface LinkedTask {
  id: string;
  title: string;
  kind: string;
  type: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  deadline_date: string | null;
  completed_at: string | null;
}

/**
 * 아카이브 항목 상세에 표시되는 "연결된 할일/일정" 목록.
 * 새 할일이 추가되면 자동으로 여기 누적됨 (양방향 relation).
 */
export default function LinkedTasksList({ entryId }: { entryId: string }) {
  const [tasks, setTasks] = useState<LinkedTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/archive/entries/${entryId}/linked-tasks`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setTasks(j.tasks ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (loading) {
    return (
      <div className="text-xs text-gray-400 px-1 py-2">불러오는 중…</div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="text-xs text-gray-400 px-1 py-2">
        아직 연결된 할일/일정이 없어요. 할일 만들 때 이 항목을 연결해보세요.
      </div>
    );
  }

  // 완료/예정으로 분리
  const done = tasks.filter((t) => t.status === 'done');
  const pending = tasks.filter((t) => t.status !== 'done');

  return (
    <div className="space-y-2">
      {pending.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1 px-1">
            예정/진행 ({pending.length})
          </p>
          <div className="space-y-1">
            {pending.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}
      {done.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1 px-1">
            완료 ({done.length})
          </p>
          <div className="space-y-1">
            {done.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: LinkedTask }) {
  const isDone = task.status === 'done';
  const refDate = task.due_date ?? task.deadline_date ?? task.completed_at?.slice(0, 10);
  const dateText = refDate ? dayjs(refDate).format('M/D (ddd)') : '';
  const timeText = task.due_time ? task.due_time.slice(0, 5) : '';

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${
        isDone ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white border-gray-100'
      }`}
    >
      {isDone ? (
        <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
      ) : (
        <Circle size={14} className="text-gray-300 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs ${
            isDone ? 'text-gray-400 line-through' : 'text-gray-800 font-medium'
          } truncate`}
        >
          {task.title}
        </div>
        {(dateText || timeText) && (
          <div className="text-[10px] text-gray-400 inline-flex items-center gap-0.5">
            <Calendar size={9} />
            {dateText}
            {timeText && ` ${timeText}`}
          </div>
        )}
      </div>
      {task.kind === 'event' && (
        <span className="text-[9px] bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full">
          일정
        </span>
      )}
      {task.kind === 'todo' && (
        <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
          할일
        </span>
      )}
    </div>
  );
}
