'use client';

import { Repeat, X } from 'lucide-react';

export type RoutineScope = 'this_only' | 'this_and_future' | 'all';

interface Props {
  open: boolean;
  action: '수정' | '삭제';
  occurrenceDate: string; // 현재 보고 있는 날짜
  startDate?: string | null; // 루틴 시작일 (시작일 == occurrence 면 안내)
  onClose: () => void;
  onConfirm: (scope: RoutineScope) => void;
}

export default function RoutineScopeDialog({
  open,
  action,
  occurrenceDate,
  startDate,
  onClose,
  onConfirm,
}: Props) {
  if (!open) return null;
  const isDelete = action === '삭제';
  const isFromStart = !!startDate && startDate === occurrenceDate;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-t-3xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Repeat size={18} className="text-indigo-500" />
            <h3 className="text-base font-bold">루틴 일정 {action}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400">
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-2 text-sm text-gray-600">
          <p>
            이 일정은 반복되는 루틴이에요. 어떤 범위로 {action}할까요?
          </p>
          <p className="text-xs text-gray-400">
            기준 날짜: {occurrenceDate}
            {startDate ? ` · 시작일: ${startDate}` : ''}
          </p>
          {isFromStart && (
            <p className="text-xs text-rose-500">
              ⚠ 시작일에서 “이 날짜 이후만” 선택은 전체와 동일하게 처리돼요.
            </p>
          )}
        </div>
        <div className="px-5 pb-5 space-y-2">
          <button
            onClick={() => onConfirm('this_only')}
            className={`w-full py-3 rounded-xl text-sm font-semibold ${
              isDelete
                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            이 날짜만 {action}
          </button>
          <button
            onClick={() => onConfirm('this_and_future')}
            className={`w-full py-3 rounded-xl text-sm font-semibold ${
              isDelete
                ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
            }`}
          >
            이 날짜 이후만 {action}
          </button>
          <button
            onClick={() => onConfirm('all')}
            className={`w-full py-3 rounded-xl text-sm font-semibold ${
              isDelete
                ? 'bg-rose-600 text-white hover:bg-rose-700'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            전체 일정 {action}
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm text-gray-500"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
