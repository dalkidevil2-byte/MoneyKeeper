'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, Square, Plus, Settings as SettingsIcon } from 'lucide-react';
import type { Activity } from '@/types';
import ActivityFormSheet from './ActivityFormSheet';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 홈 상단 자주 쓰는 활동 칩 — 클릭 1번으로 ▶/■.
 * - 진행 중 활동은 빨간 펄스 + 경과시간 표시
 * - 다른 활동 ▶ 누르면 자동으로 정지 후 새 시작
 */
export default function ActivityChips({ onChange }: { onChange?: () => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/activities?household_id=${HOUSEHOLD_ID}`);
      const j = await res.json();
      setActivities(j.activities ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 진행 중 세션 있을 때 1초 tick (경과 시간 표시)
  useEffect(() => {
    const hasRunning = activities.some((a) => a.running_session);
    if (!hasRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activities]);

  const start = async (a: Activity) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      // 다른 진행 중 활동 자동 정지
      const others = activities.filter(
        (x) => x.running_session && x.id !== a.id,
      );
      for (const o of others) {
        await fetch(`/api/activities/${o.id}/stop`, { method: 'POST' });
      }
      await fetch(`/api/activities/${a.id}/start`, { method: 'POST' });
      await load();
      onChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const stop = async (a: Activity) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      await fetch(`/api/activities/${a.id}/stop`, { method: 'POST' });
      await load();
      onChange?.();
    } finally {
      setBusyId(null);
    }
  };

  const fmtMin = (m: number): string => {
    if (m <= 0) return '0분';
    const h = Math.floor(m / 60);
    const mm = m % 60;
    if (h === 0) return `${mm}분`;
    if (mm === 0) return `${h}시간`;
    return `${h}시간 ${mm}분`;
  };

  const elapsedMin = (startAt: string): number => {
    const elapsed = Math.max(0, now - new Date(startAt).getTime());
    return Math.floor(elapsed / 60000);
  };

  const elapsedLabel = (startAt: string): string => {
    const totalMs = Math.max(0, now - new Date(startAt).getTime());
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const favorites = activities.filter((a) => a.is_favorite);

  if (loading && activities.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-700">⏱ 활동 추적</h2>
        <button
          onClick={() => setAdding(true)}
          className="text-xs text-violet-600 font-semibold inline-flex items-center gap-0.5"
        >
          <Plus size={12} /> 추가
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="text-xs text-gray-400 py-3 text-center bg-white rounded-2xl border border-dashed border-gray-200">
          자주 하는 활동 추가하고 ▶로 시간 기록해보세요
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {favorites.map((a) => {
            const running = a.running_session ?? null;
            const isRunning = !!running;
            const todayMin = a.today_minutes ?? 0;
            const liveMin = isRunning && running ? elapsedMin(running.start_at) : 0;
            const totalToday = todayMin + liveMin;
            return (
              <div
                key={a.id}
                className={`flex items-stretch rounded-2xl overflow-hidden border ${
                  isRunning
                    ? 'border-rose-300 bg-rose-50/70'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <button
                  onClick={() => isRunning ? stop(a) : start(a)}
                  disabled={busyId === a.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setEditing(a);
                  }}
                  className="flex items-center gap-2 px-3 py-2 active:bg-gray-50 disabled:opacity-50 min-w-0"
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white ${
                      isRunning ? 'animate-pulse' : ''
                    }`}
                    style={{ backgroundColor: isRunning ? '#ef4444' : a.color }}
                  >
                    {isRunning ? <Square size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                  </span>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1">
                      <span>{a.emoji}</span>
                      <span className="truncate">{a.name}</span>
                    </div>
                    {isRunning && running ? (
                      <div className="text-[11px] text-rose-600 font-bold tabular-nums">
                        {elapsedLabel(running.start_at)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-500">
                        오늘 {fmtMin(totalToday)}
                      </div>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => setEditing(a)}
                  className="px-1.5 text-gray-300 hover:text-gray-500 active:bg-gray-100"
                  aria-label="설정"
                  title="활동 설정"
                >
                  <SettingsIcon size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <ActivityFormSheet
          initial={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            void load();
          }}
        />
      )}
    </section>
  );
}
