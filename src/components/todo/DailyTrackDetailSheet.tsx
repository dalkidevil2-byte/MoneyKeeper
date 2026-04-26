'use client';

import { useEffect, useState } from 'react';
import { X, Plus, Minus, Pencil, Flame, TrendingUp, Calendar as CalendarIcon } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import type { DailyTrack } from '@/types';
import { DAILY_TRACK_PERIOD_LABELS } from '@/types';

dayjs.locale('ko');

interface Stats {
  history: { date: string; count: number; isDoneDay: boolean }[];
  total_count: number;
  total_days: number;
  current_streak: number;
  best_streak: number;
  this_week_count: number;
  this_month_count: number;
  active_days: number;
  completion_rate: number;
}

interface Props {
  trackId: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit?: (t: DailyTrack) => void;
}

export default function DailyTrackDetailSheet({
  trackId,
  onClose,
  onChanged,
  onEdit,
}: Props) {
  const [track, setTrack] = useState<DailyTrack | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/daily-tracks/${trackId}/stats`);
    const data = await res.json();
    setTrack(data.track);
    setStats(data.stats);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  const inc = async () => {
    setBusy(true);
    try {
      await fetch(`/api/daily-tracks/${trackId}/check`, { method: 'POST' });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  const dec = async () => {
    setBusy(true);
    try {
      await fetch(`/api/daily-tracks/${trackId}/check`, { method: 'DELETE' });
      await load();
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  if (!track || !stats) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
        <div className="w-full max-w-lg bg-white rounded-t-3xl p-8 text-center text-gray-400">
          불러오는 중…
        </div>
      </div>
    );
  }

  const cur = track.current_count ?? 0;
  const allDone = cur >= track.target_count;
  const periodLabel = DAILY_TRACK_PERIOD_LABELS[track.period_unit];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">{track.emoji || '✅'}</span>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate">{track.title}</h2>
              <div className="text-[11px] text-gray-500">
                {periodLabel} {track.target_count}회
                {track.member && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: track.member.color }}
                    />
                    {track.member.name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={() => onEdit(track)}
                className="p-2 text-gray-400 hover:text-gray-700"
                aria-label="편집"
              >
                <Pencil size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 오늘 진행 카드 */}
          <div
            className={`rounded-2xl p-4 border ${
              allDone
                ? 'bg-emerald-50 border-emerald-200'
                : cur > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-gray-50 border-gray-100'
            }`}
          >
            <div className="text-[11px] text-gray-500 mb-1">오늘 진행</div>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-3xl font-bold ${
                  allDone
                    ? 'text-emerald-600'
                    : cur > 0
                      ? 'text-amber-600'
                      : 'text-gray-400'
                }`}
              >
                {cur}
                <span className="text-base font-normal text-gray-400"> / {track.target_count}</span>
              </span>
              <div className="flex gap-1.5">
                <button
                  onClick={dec}
                  disabled={busy || cur === 0}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-600 text-sm font-bold disabled:opacity-30 inline-flex items-center gap-1"
                >
                  <Minus size={14} /> -1
                </button>
                <button
                  onClick={inc}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold disabled:opacity-30 inline-flex items-center gap-1"
                >
                  <Plus size={14} /> +1
                </button>
              </div>
            </div>
            <div className="h-1.5 bg-white rounded-full mt-2 overflow-hidden border border-gray-100">
              <div
                className={`h-full rounded-full transition-all ${allDone ? 'bg-emerald-400' : 'bg-amber-400'}`}
                style={{
                  width: `${Math.min(100, (cur / Math.max(1, track.target_count)) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* 통계 4개 */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={<Flame size={14} className="text-rose-500" />}
              label="현재 연속"
              value={`${stats.current_streak}일`}
            />
            <StatCard
              icon={<TrendingUp size={14} className="text-indigo-500" />}
              label="최장 연속"
              value={`${stats.best_streak}일`}
            />
            <StatCard
              icon={<CalendarIcon size={14} className="text-amber-500" />}
              label="이번 주"
              value={`${stats.this_week_count}회`}
            />
            <StatCard
              icon={<CalendarIcon size={14} className="text-emerald-500" />}
              label="이번 달"
              value={`${stats.this_month_count}회`}
            />
          </div>

          {/* 누적 정보 */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 flex items-center justify-between">
            <span>
              총 <b className="text-gray-900">{stats.total_count}회</b> · {stats.total_days}일 활동
            </span>
            <span>
              달성률 <b className="text-amber-600">{stats.completion_rate}%</b>
            </span>
          </div>

          {/* 히트맵 (최근 12주 = 84일) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-700">최근 12주 활동</h3>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <span>적음</span>
                <Heat n={0} small />
                <Heat n={1} small max={track.target_count} />
                <Heat n={2} small max={track.target_count} />
                <Heat n={3} small max={track.target_count} />
                <Heat n={4} small max={track.target_count} />
                <span>많음</span>
              </div>
            </div>
            <Heatmap history={stats.history} maxCount={track.target_count} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-xl p-3 border border-gray-100">
      <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
        {icon} {label}
      </div>
      <div className="text-xl font-bold text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}

// 히트맵: 12 주 (열) × 7 일 (행, 일~토)
function Heatmap({
  history,
  maxCount,
}: {
  history: { date: string; count: number; isDoneDay: boolean }[];
  maxCount: number;
}) {
  if (history.length === 0) return null;

  // 일자별 맵
  const map = new Map(history.map((h) => [h.date, h]));

  // 시작 = 오늘 - 83일을 그 주 일요일로 정렬
  const startCell = dayjs(history[0].date).startOf('week');
  const today = dayjs(history[history.length - 1].date);
  const totalDays = today.diff(startCell, 'day') + 1;
  const weeks = Math.ceil(totalDays / 7);

  // weeks × 7 grid (week-major: cols=weeks, rows=7)
  const cells: ({ date: string; count: number; isDoneDay: boolean } | null)[][] = [];
  for (let r = 0; r < 7; r++) {
    const row: ({ date: string; count: number; isDoneDay: boolean } | null)[] = [];
    for (let c = 0; c < weeks; c++) {
      const d = startCell.add(c * 7 + r, 'day');
      const key = d.format('YYYY-MM-DD');
      if (d.isAfter(today, 'day')) {
        row.push(null);
      } else {
        row.push(map.get(key) ?? { date: key, count: 0, isDoneDay: false });
      }
    }
    cells.push(row);
  }

  // 월 라벨 (각 주의 첫 컬럼이 새 달의 시작이면 라벨)
  const monthLabels: { col: number; label: string }[] = [];
  for (let c = 0; c < weeks; c++) {
    const firstDayOfWeek = startCell.add(c * 7, 'day');
    if (c === 0 || firstDayOfWeek.date() <= 7) {
      monthLabels.push({ col: c, label: `${firstDayOfWeek.month() + 1}월` });
    }
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate" style={{ borderSpacing: '2px' }}>
        <thead>
          <tr>
            <td className="w-6" />
            {Array.from({ length: weeks }).map((_, c) => {
              const m = monthLabels.find((x) => x.col === c);
              return (
                <td key={c} className="text-[9px] text-gray-400 align-top">
                  {m ? m.label : ''}
                </td>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {cells.map((row, r) => (
            <tr key={r}>
              <td className="text-[9px] text-gray-400 pr-1 align-middle">
                {r === 0 ? '일' : r === 3 ? '수' : r === 6 ? '토' : ''}
              </td>
              {row.map((cell, c) => (
                <td key={c}>
                  {cell ? (
                    <Heat n={cell.count} max={maxCount} title={`${cell.date} · ${cell.count}회`} />
                  ) : (
                    <div className="w-3 h-3" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Heat({
  n,
  max,
  small,
  title,
}: {
  n: number;
  max?: number;
  small?: boolean;
  title?: string;
}) {
  const target = Math.max(1, max ?? 1);
  // 색 농도: 0 → gray-100, 1~target → amber 단계
  let bg = 'bg-gray-100';
  if (n > 0) {
    const ratio = n / target;
    if (ratio >= 1.5) bg = 'bg-emerald-500';
    else if (ratio >= 1) bg = 'bg-amber-500';
    else if (ratio >= 0.66) bg = 'bg-amber-400';
    else if (ratio >= 0.33) bg = 'bg-amber-300';
    else bg = 'bg-amber-200';
  }
  return (
    <div
      className={`${small ? 'w-2 h-2' : 'w-3 h-3'} rounded-sm ${bg}`}
      title={title}
    />
  );
}
