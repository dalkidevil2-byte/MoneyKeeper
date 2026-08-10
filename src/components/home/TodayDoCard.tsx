'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Plus, X, Settings2 } from 'lucide-react';
import dayjs from 'dayjs';
import { isTaskDueOn, isTaskCompletedOn } from '@/lib/task-recurrence';
import type { Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;

/** 새 루틴을 만들 때 고르는 주기 — 흔한 것만 추려서 고민 없이 고르게 한다. */
const FREQ_OPTIONS = [
  { key: 'daily', label: '매일', recurrence: { freq: 'daily' } },
  { key: 'weekday', label: '평일', recurrence: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5] } },
  { key: 'mwf', label: '월수금', recurrence: { freq: 'weekly', weekdays: [1, 3, 5] } },
  { key: 'sat', label: '토요일', recurrence: { freq: 'weekly', weekdays: [6] } },
  { key: 'sun', label: '일요일', recurrence: { freq: 'weekly', weekdays: [0] } },
] as const;

/**
 * 첫 화면의 오늘 할 것 — 루틴 + 오늘까지 해야 하는 할일.
 *
 * 루틴이 안 쓰이던 이유는 '할일 화면까지 들어가야' 했기 때문이라,
 * 앱을 열면 바로 보이고 탭 한 번으로 체크되게 둔다.
 * 추가도 여기서 바로, 삭제도 여기서 바로 되게 한다.
 */
export default function TodayDoCard() {
  const [routines, setRoutines] = useState<Task[]>([]);
  const [todos, setTodos] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState<string>('daily');
  const [manageMode, setManageMode] = useState(false);

  const today = dayjs().format('YYYY-MM-DD');

  const load = useCallback(async () => {
    try {
      const [routineRes, todoRes] = await Promise.all([
        fetch(`/api/tasks?household_id=${HOUSEHOLD_ID}&type=routine&include_completions=1`).then((r) => r.json()),
        // 습관 루틴도 kind=todo 라서, 반복이 아닌 '단발 할일' 만 따로 가져온다.
        // (안 그러면 루틴이 아래 할일 목록에 한 번 더 나온다)
        fetch(`/api/tasks?household_id=${HOUSEHOLD_ID}&kind=todo&type=one_time&status=pending`).then((r) => r.json()),
      ]);
      setRoutines((routineRes.tasks ?? []) as Task[]);
      setTodos((todoRes.tasks ?? []) as Task[]);
    } catch {
      setRoutines([]);
      setTodos([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 앱으로 돌아올 때 갱신 (홈 화면에 띄워두면 화면이 멈춰 있어서)
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [load]);

  // 오늘 해야 하는 것만. 생일 같은 연 1회 루틴은 해당 날짜에만 뜬다.
  const todays = routines.filter((t) => t.is_active && isTaskDueOn(t, today));
  const doneCount = todays.filter((t) => isTaskCompletedOn(t, today)).length;

  // 오늘까지 해야 하는 할일 — 기한이 없거나 오늘이거나 이미 지난 것.
  // 미래 기한(예: 11월)은 오늘 할 일이 아니므로 뺀다.
  const todayTodos = todos.filter(
    (t) => t.is_active && (!t.deadline_date || t.deadline_date <= today),
  );
  const totalCount = todays.length + todayTodos.length;

  const toggle = async (t: Task) => {
    if (busyId) return;
    setBusyId(t.id);
    const done = isTaskCompletedOn(t, today);
    try {
      if (done) {
        await fetch(`/api/tasks/${t.id}/complete?date=${today}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/tasks/${t.id}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed_on: today }),
        });
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const addRoutine = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const opt = FREQ_OPTIONS.find((o) => o.key === newFreq) ?? FREQ_OPTIONS[0];
    setBusyId('new');
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          // 습관 루틴은 '할일'이다. 일정(event)으로 만들면 캘린더에 매일 뜬다.
          // 생일 같은 '반복 일정'과는 다른 것이므로 kind 를 나눠 쓴다.
          kind: 'todo',
          type: 'routine',
          title,
          recurrence: opt.recurrence,
        }),
      });
      setNewTitle('');
      setAdding(false);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const removeRoutine = async (t: Task) => {
    if (!confirm(`'${t.title}' 루틴을 삭제할까요?\n(지금까지 체크한 기록도 함께 사라집니다)`)) return;
    setBusyId(t.id);
    try {
      await fetch(`/api/tasks/${t.id}`, { method: 'DELETE' });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  // 오늘 할 게 없고 추가 중도 아니면 카드를 아예 안 보여준다 (빈칸이 남지 않게)
  if (loaded && totalCount === 0 && !adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="w-full bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-3 text-xs text-gray-400 active:bg-gray-50"
      >
        + 오늘의 루틴 추가
      </button>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">
          오늘 할 것
          {totalCount > 0 && (
            <span className={`ml-1 font-medium ${doneCount === totalCount ? 'text-emerald-500' : 'text-indigo-500'}`}>
              {doneCount}/{totalCount}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setManageMode((v) => !v)}
            className={`p-1 rounded-lg ${manageMode ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300'}`}
            title="루틴 편집"
          >
            <Settings2 size={14} />
          </button>
          <button onClick={() => setAdding((v) => !v)} className="p-1 rounded-lg text-gray-400" title="루틴 추가">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {todays.map((t) => {
          const done = isTaskCompletedOn(t, today);
          return (
            <div key={t.id} className="flex items-center gap-2">
              <button
                onClick={() => toggle(t)}
                disabled={busyId === t.id}
                className="flex items-center gap-2 flex-1 min-w-0 py-1 text-left disabled:opacity-50"
              >
                <span
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    done ? 'bg-emerald-500 border-emerald-500' : 'border-gray-200'
                  }`}
                >
                  {done && <Check size={13} className="text-white" strokeWidth={3} />}
                </span>
                <span className={`text-sm truncate ${done ? 'text-gray-300 line-through' : 'text-gray-700'}`}>
                  {t.title}
                </span>
              </button>
              {manageMode && (
                <button
                  onClick={() => removeRoutine(t)}
                  className="p-1 text-gray-300 active:text-rose-500"
                  title="삭제"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}

        {/* 오늘까지 해야 하는 할일 — 루틴 아래에 이어서. 체크하면 목록에서 사라진다. */}
        {todayTodos.map((t) => {
          const overdue = Boolean(t.deadline_date && t.deadline_date < today);
          return (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              disabled={busyId === t.id}
              className="flex items-center gap-2 w-full py-1 text-left disabled:opacity-50"
            >
              <span className="w-5 h-5 rounded-md border-2 border-gray-200 shrink-0" />
              <span className="text-sm text-gray-700 truncate flex-1 min-w-0">{t.title}</span>
              {overdue && <span className="text-[10px] text-rose-400 shrink-0">기한 지남</span>}
            </button>
          );
        })}
      </div>

      {adding && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRoutine()}
            placeholder="루틴 이름 (예: 영양제)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <div className="flex gap-1.5 flex-wrap">
            {FREQ_OPTIONS.map((o) => (
              <button
                key={o.key}
                onClick={() => setNewFreq(o.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${
                  newFreq === o.key
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setNewTitle('');
              }}
              className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-xl text-sm"
            >
              취소
            </button>
            <button
              onClick={addRoutine}
              disabled={!newTitle.trim() || busyId === 'new'}
              className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium disabled:opacity-40"
            >
              추가
            </button>
          </div>
        </div>
      )}

      {manageMode && (
        <Link
          href="/todo/routines"
          className="block mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400 text-center"
        >
          주기·상세 설정은 루틴 관리에서 →
        </Link>
      )}
    </div>
  );
}
