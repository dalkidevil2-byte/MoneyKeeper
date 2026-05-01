'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, Square } from 'lucide-react';
import dayjs from 'dayjs';

const KEY = 'todo:active_timer';

type Active = { taskId: string; sessionId: string; startedAt: number };

function readActive(): Active | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.taskId && parsed.sessionId && parsed.startedAt) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 할일 카드의 ▶/■ 타이머.
 * - 한 번에 하나만 실행 (다른 task ▶ 누르면 기존 타이머 정지 후 시작)
 * - localStorage 로 페이지 이동/새로고침 후에도 유지
 * - storage 이벤트로 다른 카드 간 동기화
 * - 정지 시 task_work_sessions PATCH 로 end_time 기록
 */
export default function TaskTimer({
  taskId,
  onChange,
  size = 'md',
}: {
  taskId: string;
  onChange?: () => void;
  size?: 'sm' | 'md';
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  // 초기 로드
  useEffect(() => {
    setActive(readActive());
  }, []);

  // 1초마다 tick (실행 중일 때만)
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  // 다른 탭/컴포넌트 storage 이벤트로 동기화
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      setActive(readActive());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const isRunning = active?.taskId === taskId;
  const elapsedMs = isRunning && active ? Math.max(0, now - active.startedAt) : 0;
  const hh = Math.floor(elapsedMs / 3600000);
  const mm = Math.floor((elapsedMs % 3600000) / 60000);
  const ss = Math.floor((elapsedMs % 60000) / 1000);
  const elapsedLabel =
    hh > 0
      ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  const stopActive = useCallback(async (a: Active | null) => {
    if (!a) return;
    const startedDay = dayjs(a.startedAt).format('YYYY-MM-DD');
    const today = dayjs().format('YYYY-MM-DD');
    const nowTime = dayjs().format('HH:mm:ss');
    try {
      if (startedDay === today) {
        // 같은 날 — 정상 종료
        await fetch(`/api/tasks/${a.taskId}/sessions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: a.sessionId, end_time: nowTime }),
        });
      } else {
        // 자정을 넘김 — 시작일은 23:59:59 로 마감하고 오늘은 새 세션 추가
        await fetch(`/api/tasks/${a.taskId}/sessions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: a.sessionId, end_time: '23:59:59' }),
        });
        // 중간 날짜들 (시작일+1 ~ 오늘-1) 은 종일 세션 추가
        let cursor = dayjs(a.startedAt).add(1, 'day').format('YYYY-MM-DD');
        while (cursor < today) {
          await fetch(`/api/tasks/${a.taskId}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_date: cursor,
              start_time: '00:00:00',
              end_time: '23:59:59',
            }),
          });
          cursor = dayjs(cursor).add(1, 'day').format('YYYY-MM-DD');
        }
        // 오늘 00:00:00 ~ 현재 까지 새 세션
        await fetch(`/api/tasks/${a.taskId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_date: today,
            start_time: '00:00:00',
            end_time: nowTime,
          }),
        });
      }
    } catch {
      /* network 오류는 무시 — UI 는 멈춤 */
    }
    localStorage.removeItem(KEY);
    setActive(null);
  }, []);

  const onStart = useCallback(
    async (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        const cur = readActive();
        if (cur && cur.taskId !== taskId) {
          if (!confirm('다른 할일 타이머가 실행 중이에요.\n정지하고 새 타이머를 시작할까요?')) {
            return;
          }
          await stopActive(cur);
        }
        const today = dayjs().format('YYYY-MM-DD');
        const nowTime = dayjs().format('HH:mm:ss');
        const res = await fetch(`/api/tasks/${taskId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_date: today, start_time: nowTime }),
        });
        if (!res.ok) return;
        const j = await res.json();
        const sid = j.session?.id;
        if (!sid) return;
        const data: Active = { taskId, sessionId: sid, startedAt: Date.now() };
        localStorage.setItem(KEY, JSON.stringify(data));
        setActive(data);
        onChange?.();
      } finally {
        setBusy(false);
      }
    },
    [taskId, busy, onChange, stopActive]
  );

  const onStop = useCallback(
    async (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        await stopActive(active);
        onChange?.();
      } finally {
        setBusy(false);
      }
    },
    [active, busy, onChange, stopActive]
  );

  const padCls = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]';
  const iconSize = size === 'sm' ? 11 : 12;

  if (isRunning) {
    return (
      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className={`shrink-0 inline-flex items-center gap-1 bg-rose-500 text-white rounded-lg font-bold animate-pulse disabled:opacity-50 ${padCls}`}
        aria-label="타이머 정지"
        title="타이머 정지"
      >
        <Square size={iconSize} fill="currentColor" />
        <span className="tabular-nums">{elapsedLabel}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={busy}
      className="shrink-0 p-1.5 rounded-lg bg-emerald-50 text-emerald-600 active:bg-emerald-100 disabled:opacity-50"
      aria-label="타이머 시작"
      title="타이머 시작"
    >
      <Play size={size === 'sm' ? 12 : 14} fill="currentColor" />
    </button>
  );
}
