'use client';

import { useState } from 'react';
import { Plus, Repeat as RepeatIcon, Pause, Play } from 'lucide-react';
import { useTasks, useSaveTask } from '@/hooks/useTasks';
import { describeRecurrence } from '@/lib/task-recurrence';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import type { Task } from '@/types';

export default function RoutinesPage() {
  const { tasks, loading, refetch } = useTasks({ type: 'routine', include_cancelled: false });
  const { update } = useSaveTask();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const togglePause = async (t: Task) => {
    await update(t.id, { is_active: !t.is_active });
    refetch();
  };

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setSheetOpen(true);
  };

  const active = tasks.filter((t) => t.is_active);
  const paused = tasks.filter((t) => !t.is_active);

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">루틴 관리</h1>
        <p className="text-sm text-gray-500 mt-1">반복되는 할일을 한 곳에서</p>
      </div>

      <div className="px-5 space-y-5">
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">활성 ({active.length})</h2>
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">불러오는 중…</div>
          ) : active.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              루틴이 없어요. 우측 하단 + 버튼으로 추가하세요.
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((t) => (
                <RoutineRow key={t.id} task={t} onToggle={togglePause} onClick={openEdit} />
              ))}
            </div>
          )}
        </section>

        {paused.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-400 mb-2">일시 정지 ({paused.length})</h2>
            <div className="space-y-2 opacity-60">
              {paused.map((t) => (
                <RoutineRow key={t.id} task={t} onToggle={togglePause} onClick={openEdit} />
              ))}
            </div>
          </section>
        )}
      </div>

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
      />
    </div>
  );
}

function RoutineRow({
  task,
  onToggle,
  onClick,
}: {
  task: Task;
  onToggle: (t: Task) => void;
  onClick: (t: Task) => void;
}) {
  return (
    <div
      onClick={() => onClick(task)}
      className="flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 active:scale-[0.99]"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
        <RepeatIcon size={18} className="text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-gray-800 truncate">{task.title}</div>
        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
          <span>{describeRecurrence(task.recurrence)}</span>
          {task.member && (
            <span className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: task.member.color }}
              />
              {task.member.name}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task);
        }}
        className="text-gray-400 hover:text-gray-700 p-2"
        aria-label={task.is_active ? '일시정지' : '재개'}
      >
        {task.is_active ? <Pause size={18} /> : <Play size={18} />}
      </button>
    </div>
  );
}
