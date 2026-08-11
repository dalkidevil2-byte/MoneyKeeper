'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dayjs from 'dayjs';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;

type Tx = { type: string; amount: number; date: string };

// /api/tasks/today 는 항목을 task 로 한 겹 감싸서 준다.
// (완료 여부는 바깥의 completed_today 에 있다)
type TodayItem = {
  task: { title: string; due_time?: string | null };
  completed_today?: boolean;
};
type TodayTask = { title: string; due_time?: string | null; done: boolean };

/**
 * 첫 화면 맨 위 — 앱을 열자마자 오늘 상황이 보이도록.
 * 홈 화면 위젯을 만들 수 없는 대신(웹앱은 안드로이드 위젯을 만들 수 없다),
 * 아이콘 한 번 탭으로 같은 정보를 보게 하는 자리다.
 */
export default function TodaySummary() {
  const [todaySpent, setTodaySpent] = useState<number | null>(null);
  const [todayFixed, setTodayFixed] = useState(0);
  const [monthSpent, setMonthSpent] = useState(0);
  const [monthFixed, setMonthFixed] = useState(0);
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [taskCount, setTaskCount] = useState(0);

  // 홈 화면에 앱을 띄워두면 화면이 메모리에 남아 숫자가 그대로 멈춘다.
  // 카드를 쓰고 앱으로 돌아왔을 때 바로 반영되도록, 앱이 다시 보일 때마다 새로 불러온다.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setReloadKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    const today = dayjs();
    const todayStr = today.format('YYYY-MM-DD');
    const start = today.startOf('month').format('YYYY-MM-DD');
    const end = today.endOf('month').format('YYYY-MM-DD');
    let cancelled = false;

    (async () => {
      try {
        const [txRes, taskRes] = await Promise.all([
          fetch(`/api/transactions?start_date=${start}&end_date=${end}&limit=500`).then((r) => r.json()),
          fetch(`/api/tasks/today?household_id=${HOUSEHOLD_ID}`).then((r) => r.json()),
        ]);
        if (cancelled) return;

        // 고정비용(관리비·구독·상조 등)을 변동 지출과 섞으면
        // '오늘 많이 썼다' 처럼 보여서 실제 씀씀이를 판단할 수 없다. 나눠서 보여준다.
        const all: Tx[] = txRes.transactions ?? [];
        const sum = (list: Tx[]) => list.reduce((s, t) => s + t.amount, 0);
        const variable = all.filter((t) => t.type === 'variable_expense');
        const fixed = all.filter((t) => t.type === 'fixed_expense');

        setMonthSpent(sum(variable));
        setMonthFixed(sum(fixed));
        setTodayFixed(sum(fixed.filter((t) => t.date === todayStr)));
        setTodaySpent(sum(variable.filter((t) => t.date === todayStr)));

        const items = (taskRes?.today ?? []) as TodayItem[];
        // 아직 안 한 일정을 먼저 보여준다 (완료된 건 뒤로)
        const list: TodayTask[] = items
          .map((it) => ({
            title: it.task?.title ?? '',
            due_time: it.task?.due_time ?? null,
            done: Boolean(it.completed_today),
          }))
          .filter((t) => t.title)
          .sort((a, b) => Number(a.done) - Number(b.done));
        setTasks(list.slice(0, 2));
        setTaskCount(taskRes?.counts?.today_total ?? list.length);
      } catch {
        if (!cancelled) setTodaySpent(0);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const loading = todaySpent === null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {/* 오늘 쓴 돈 */}
      <Link
        href="/budget"
        className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
      >
        <p className="text-xs text-gray-400">오늘 쓴 돈 <span className="text-gray-300">(변동)</span></p>
        {loading ? (
          <div className="h-6 w-20 bg-gray-100 rounded mt-1.5 animate-pulse" />
        ) : (
          <>
            {/* 오늘 것도 변동/고정을 항상 나눠서 보여준다.
                합쳐 놓으면 고정비용 때문에 많이 쓴 것처럼 보인다. */}
            <p className="text-xl font-bold text-gray-900 mt-0.5 tabular-nums">
              {todaySpent.toLocaleString('ko-KR')}
              <span className="text-sm font-semibold text-gray-400 ml-0.5">원</span>
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              고정 {todayFixed.toLocaleString('ko-KR')}원
            </p>
            <p className="text-[11px] text-gray-400 mt-1.5 pt-1.5 border-t border-gray-50">
              이번 달 {monthSpent.toLocaleString('ko-KR')}원
              <br />
              <span className="text-gray-300">고정 {monthFixed.toLocaleString('ko-KR')}원</span>
            </p>
          </>
        )}
      </Link>

      {/* 오늘 일정 */}
      <Link
        href="/todo"
        className="bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 active:scale-[0.98] transition-transform"
      >
        <p className="text-xs text-gray-400">
          오늘 일정{taskCount > 0 && <span className="text-indigo-500 font-medium"> {taskCount}건</span>}
        </p>
        {loading ? (
          <div className="h-6 w-24 bg-gray-100 rounded mt-1.5 animate-pulse" />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-300 mt-2">없어요</p>
        ) : (
          <div className="mt-1 space-y-0.5">
            {tasks.map((t, i) => (
              <p
                key={i}
                className={`text-sm truncate ${t.done ? 'text-gray-300 line-through' : 'text-gray-700'}`}
              >
                {t.due_time && (
                  <span
                    className={`font-medium tabular-nums mr-1.5 ${t.done ? 'text-gray-300' : 'text-indigo-500'}`}
                  >
                    {t.due_time.slice(0, 5)}
                  </span>
                )}
                {t.title}
              </p>
            ))}
            {taskCount > tasks.length && (
              <p className="text-xs text-gray-400">외 {taskCount - tasks.length}건</p>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}
