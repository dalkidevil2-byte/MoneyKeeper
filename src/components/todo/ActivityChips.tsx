'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, Square, Plus, Settings as SettingsIcon, ChevronDown, ChevronUp } from 'lucide-react';
import type { Activity } from '@/types';
import ActivityFormSheet from './ActivityFormSheet';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 활동 추적 영역 — 진행 중 활동 prominent + 나머지 칩은 collapse 가능.
 */
export default function ActivityChips({ onChange }: { onChange?: () => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [expanded, setExpanded] = useState(false);
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
      const others = activities.filter((x) => x.running_session && x.id !== a.id);
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
  const running = activities.filter((a) => a.running_session);

  if (loading && activities.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-gray-700 inline-flex items-center gap-1">
          ⏱ 활동 추적
          {favorites.length > 0 && (
            <span className="text-xs text-gray-400 font-normal">({favorites.length})</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-violet-600 font-semibold inline-flex items-center gap-0.5"
          >
            <Plus size={12} /> 추가
          </button>
          {favorites.length > 3 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-gray-500 inline-flex items-center gap-0.5"
            >
              {expanded ? <><ChevronUp size={12} /> 접기</> : <><ChevronDown size={12} /> 전체</>}
            </button>
          )}
        </div>
      </div>

      {/* 진행 중인 활동 큰 카드 */}
      {running.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {running.map((a) => {
            const r = a.running_session!;
            return (
              <button
                key={`run-${a.id}`}
                onClick={() => stop(a)}
                disabled={busyId === a.id}
                className="w-full bg-rose-50 border-2 border-rose-300 rounded-2xl px-4 py-3 active:bg-rose-100 disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white animate-pulse shrink-0"
                    style={{ backgroundColor: '#ef4444' }}
                  >
                    <Square size={16} fill="currentColor" />
                  </span>
                  <div className="flex-1 text-left">
                    <div className="text-sm font-bold text-gray-900 inline-flex items-center gap-1">
                      <span>{a.emoji}</span>
                      <span>{a.name}</span>
                      <span className="text-[10px] text-rose-500 font-bold ml-1">진행중</span>
                    </div>
                    <div className="text-xs text-rose-600 font-bold tabular-nums mt-0.5">
                      {elapsedLabel(r.start_at)}
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500 shrink-0">
                    오늘 {fmtMin((a.today_minutes ?? 0) + elapsedMin(r.start_at))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 즐겨찾기 칩 (진행중 제외) — 가로 스크롤 + 접힘 */}
      {(() => {
        const idle = favorites.filter((a) => !a.running_session);
        if (idle.length === 0 && running.length === 0) {
          return (
            <div className="text-xs text-gray-400 py-3 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              자주 하는 활동 추가하고 ▶로 시간 기록해보세요
            </div>
          );
        }
        if (idle.length === 0) return null;
        const visible = expanded ? idle : idle.slice(0, 3);
        return (
          <div className="flex gap-2 flex-wrap">
            {visible.map((a) => (
              <div
                key={a.id}
                className="flex items-stretch rounded-2xl overflow-hidden border border-gray-200 bg-white"
              >
                <button
                  onClick={() => start(a)}
                  disabled={busyId === a.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setEditing(a);
                  }}
                  className="flex items-center gap-2 px-3 py-2 active:bg-gray-50 disabled:opacity-50 min-w-0"
                >
                  <span
                    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    <Play size={12} fill="currentColor" />
                  </span>
                  <div className="text-left min-w-0">
                    <div className="text-sm font-semibold text-gray-900 truncate inline-flex items-center gap-1">
                      <span>{a.emoji}</span>
                      <span>{a.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      오늘 {fmtMin(a.today_minutes ?? 0)}
                    </div>
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
            ))}
            {!expanded && idle.length > 3 && (
              <button
                onClick={() => setExpanded(true)}
                className="px-3 py-2 rounded-2xl border border-dashed border-gray-300 text-xs text-gray-500 font-semibold inline-flex items-center"
              >
                + {idle.length - 3}개 더보기
              </button>
            )}
          </div>
        );
      })()}

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
