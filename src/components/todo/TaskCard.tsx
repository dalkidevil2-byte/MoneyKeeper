'use client';

import { Check, Clock, Repeat as RepeatIcon, AlertCircle, FileText } from 'lucide-react';
import type { TodayTask, Member } from '@/types';
import { describeRecurrence } from '@/lib/task-recurrence';
import { useMembers } from '@/hooks/useAccounts';

interface Props {
  item: TodayTask;
  onToggle: () => void;
  onClick?: () => void;
  showOverdue?: boolean;
}

export default function TaskCard({ item, onToggle, onClick, showOverdue }: Props) {
  const { task, completed_today } = item;
  const { members: allMembers } = useMembers();

  // target_member_ids 우선, 없으면 member_id
  const assignedIds: string[] =
    task.target_member_ids && task.target_member_ids.length > 0
      ? task.target_member_ids
      : task.member_id
        ? [task.member_id]
        : [];
  const assignedMembers: Member[] = assignedIds
    .map((id) => allMembers.find((m) => m.id === id))
    .filter((m): m is Member => !!m);

  const priorityRing =
    task.priority === 'high'
      ? 'ring-1 ring-rose-200'
      : task.priority === 'low'
        ? 'opacity-80'
        : '';

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 active:scale-[0.99] transition-transform ${priorityRing} ${completed_today ? 'opacity-60' : ''}`}
    >
      {/* 체크박스 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={completed_today ? '완료 취소' : '완료'}
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
          completed_today
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'border-gray-300 hover:border-indigo-400 bg-white'
        }`}
      >
        {completed_today && <Check size={16} strokeWidth={3} />}
      </button>

      {/* 제목 + 메타 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-[15px] font-semibold truncate ${completed_today ? 'line-through text-gray-400' : 'text-gray-800'}`}
          >
            {task.title}
          </span>
          {task.source === 'notion' && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold"
              title="노션에서 가져온 일정"
            >
              <FileText size={10} /> N
            </span>
          )}
          {task.priority === 'high' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500 font-bold">
              높음
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
          {showOverdue && (
            <span className="inline-flex items-center gap-0.5 text-rose-500">
              <AlertCircle size={12} /> 지난
            </span>
          )}
          {task.is_fixed && task.due_time && (
            <span className="inline-flex items-center gap-0.5">
              <Clock size={12} />
              {task.due_time.slice(0, 5)}
              {task.end_time && task.end_time !== task.due_time && `~${task.end_time.slice(0, 5)}`}
            </span>
          )}
          {task.type === 'one_time' && task.end_date && task.end_date !== task.due_date && (
            <span className="text-amber-600 text-[10px]">
              {task.due_date?.slice(5)}~{task.end_date.slice(5)}
            </span>
          )}
          {task.type === 'routine' && task.recurrence && (
            <span className="inline-flex items-center gap-0.5 text-indigo-500">
              <RepeatIcon size={12} /> {describeRecurrence(task.recurrence)}
            </span>
          )}
          {task.category_main && (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
              {task.category_main}
              {task.category_sub ? ` · ${task.category_sub}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* 멤버 dots (최대 3개 + 더 있으면 +N) */}
      {assignedMembers.length > 0 && (
        <div className="shrink-0 flex items-center gap-0.5">
          {assignedMembers.slice(0, 3).map((m) => (
            <div
              key={m.id}
              className="w-2.5 h-2.5 rounded-full ring-1 ring-white"
              style={{ backgroundColor: m.color }}
              title={m.name}
            />
          ))}
          {assignedMembers.length > 3 && (
            <span className="text-[10px] text-gray-400 ml-0.5">
              +{assignedMembers.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
