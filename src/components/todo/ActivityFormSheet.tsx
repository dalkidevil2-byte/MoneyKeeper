'use client';

import { useEffect, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import type { Activity } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface Props {
  initial?: Activity;
  onClose: () => void;
  onSaved: () => void;
}

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6',
];

export default function ActivityFormSheet({ initial, onClose, onSaved }: Props) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '⏱');
  const [color, setColor] = useState(initial?.color ?? '#6366f1');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [goalId, setGoalId] = useState(initial?.goal_id ?? '');
  const [trackId, setTrackId] = useState(initial?.daily_track_id ?? '');
  const [mode, setMode] = useState<'session' | 'hours'>(
    initial?.goal_count_mode ?? 'session',
  );
  const [busy, setBusy] = useState(false);

  const [goals, setGoals] = useState<Array<{ id: string; title: string; emoji?: string; unit?: string }>>([]);
  const [tracks, setTracks] = useState<Array<{ id: string; title: string; emoji?: string }>>([]);

  useEffect(() => {
    fetch(`/api/goals?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setGoals(d.goals ?? []))
      .catch(() => {});
    fetch(`/api/daily-tracks?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks ?? []))
      .catch(() => {});
  }, []);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        household_id: HOUSEHOLD_ID,
        name: name.trim(),
        emoji,
        color,
        category,
        goal_id: goalId || null,
        daily_track_id: trackId || null,
        goal_count_mode: mode,
      };
      const res = isEdit && initial
        ? await fetch(`/api/activities/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/activities', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      if (res.ok) onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isEdit || !initial) return;
    if (!confirm('이 활동을 삭제할까요? (기존 세션 기록은 보존됩니다)')) return;
    setBusy(true);
    try {
      await fetch(`/api/activities/${initial.id}`, { method: 'DELETE' });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-base font-bold text-gray-900">
            {isEdit ? '활동 수정' : '새 활동'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-4">
          {/* 이름 + 이모지 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">이름</label>
            <div className="flex gap-2">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value || '⏱')}
                className="w-14 px-3 py-2 border border-gray-200 rounded-xl text-center text-xl"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 독서, 운동, 게임"
                autoFocus
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
              />
            </div>
          </div>

          {/* 색상 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">색상</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full ${
                    color === c ? 'ring-2 ring-offset-2 ring-gray-700' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* 카테고리 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">카테고리 (선택)</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="예: 취미, 휴식, 생산성"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
            />
          </div>

          {/* 목표 연결 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              🎯 목표 연결 (선택)
            </label>
            <select
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">연결 안 함</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.emoji ?? '🎯'} {g.title}
                </option>
              ))}
            </select>
            {goalId && (
              <div className="mt-2">
                <label className="text-[11px] text-gray-500 mb-1 block">진행 단위</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setMode('session')}
                    className={`flex-1 py-1.5 text-xs rounded-lg border ${
                      mode === 'session'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    세션 1회 = +1
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('hours')}
                    className={`flex-1 py-1.5 text-xs rounded-lg border ${
                      mode === 'hours'
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'bg-white border-gray-200'
                    }`}
                  >
                    시간 = +시간수
                  </button>
                </div>
              </div>
            )}
            <div className="text-[11px] text-gray-400 mt-1">
              세션 종료 시 목표 진행 자동 +1 (또는 +시간).
            </div>
          </div>

          {/* Daily Track 연결 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">
              🌱 Daily Track 연결 (선택)
            </label>
            <select
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
            >
              <option value="">연결 안 함</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.emoji ?? '✅'} {t.title}
                </option>
              ))}
            </select>
            <div className="text-[11px] text-gray-400 mt-1">
              ▶ 시작 시 오늘 Daily Track 자동 체크.
            </div>
          </div>

          {/* 액션 */}
          <div className="flex gap-2 pt-2">
            {isEdit && (
              <button
                onClick={remove}
                disabled={busy}
                className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-semibold inline-flex items-center gap-1 active:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {isEdit ? '저장' : '추가'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
