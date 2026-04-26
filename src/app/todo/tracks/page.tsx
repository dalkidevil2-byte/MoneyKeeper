'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, X, CheckCircle2, Circle, MoreHorizontal } from 'lucide-react';
import type { DailyTrack, DailyTrackPeriod } from '@/types';
import { DAILY_TRACK_PERIOD_LABELS, WEEKDAY_LABELS } from '@/types';
import { useMembers } from '@/hooks/useAccounts';
import DailyTrackDetailSheet from '@/components/todo/DailyTrackDetailSheet';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export default function DailyTracksPage() {
  const [tracks, setTracks] = useState<DailyTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DailyTrack | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const refetch = async () => {
    setLoading(true);
    const res = await fetch(`/api/daily-tracks?household_id=${HOUSEHOLD_ID}`);
    const data = await res.json();
    setTracks(data.tracks ?? []);
    setLoading(false);
  };
  useEffect(() => {
    refetch();
  }, []);

  const check = async (t: DailyTrack) => {
    await fetch(`/api/daily-tracks/${t.id}/check`, { method: 'POST' });
    refetch();
  };
  const uncheck = async (t: DailyTrack) => {
    await fetch(`/api/daily-tracks/${t.id}/check`, { method: 'DELETE' });
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Daily Track</h1>
        <p className="text-sm text-gray-500 mt-1">
          매일/주기적 체크 — 약 먹기, 양치, 화장실 청소 등
        </p>
      </div>

      <div className="px-5 space-y-2">
        {loading ? (
          <div className="text-sm text-gray-400 py-8 text-center">불러오는 중…</div>
        ) : tracks.length === 0 ? (
          <div className="text-sm text-gray-400 py-10 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            아직 등록된 항목이 없어요. <br />
            <span className="text-xs">우측 하단 + 버튼으로 추가하세요</span>
          </div>
        ) : (
          tracks.map((t) => (
            <TrackRow
              key={t.id}
              track={t}
              onCheck={() => check(t)}
              onUncheck={() => uncheck(t)}
              onEdit={() => setEditing(t)}
              onDetail={() => setDetailId(t.id)}
            />
          ))
        )}
      </div>

      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      {(creating || editing) && (
        <TrackFormSheet
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refetch();
          }}
        />
      )}

      {detailId && (
        <DailyTrackDetailSheet
          trackId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={refetch}
          onEdit={(t) => {
            setDetailId(null);
            setEditing(t);
          }}
        />
      )}
    </div>
  );
}

function TrackRow({
  track,
  onCheck,
  onUncheck,
  onEdit,
  onDetail,
}: {
  track: DailyTrack;
  onCheck: () => void;
  onUncheck: () => void;
  onEdit: () => void;
  onDetail: () => void;
}) {
  const cur = track.current_count ?? 0;
  const tgt = track.target_count;
  const allDone = cur >= tgt;
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-gray-100 ${allDone ? 'opacity-70' : ''}`}
    >
      <button
        onClick={() => (allDone ? onUncheck() : onCheck())}
        aria-label={allDone ? '취소' : '체크'}
        className={`shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors ${
          allDone
            ? 'bg-emerald-500 border-emerald-500 text-white'
            : cur > 0
              ? 'bg-amber-100 border-amber-400 text-amber-700 font-bold'
              : 'border-gray-300 hover:border-amber-400'
        }`}
      >
        {allDone ? (
          <CheckCircle2 size={18} />
        ) : cur > 0 ? (
          <span className="text-xs">
            {cur}/{tgt}
          </span>
        ) : (
          <Circle size={18} className="text-gray-300" />
        )}
      </button>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onDetail}>
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{track.emoji || '✅'}</span>
          <span
            className={`text-[15px] font-semibold truncate ${allDone ? 'line-through text-gray-400' : 'text-gray-800'}`}
          >
            {track.title}
          </span>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          {DAILY_TRACK_PERIOD_LABELS[track.period_unit]} {track.target_count}회
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
      {cur > 0 && !allDone && (
        <button
          onClick={onCheck}
          className="text-xs px-2 py-1 rounded bg-amber-500 text-white font-bold"
        >
          +1
        </button>
      )}
      {cur > 0 && (
        <button
          onClick={onUncheck}
          className="text-gray-300 hover:text-rose-500 p-1"
          aria-label="-1"
        >
          <Trash2 size={14} />
        </button>
      )}
      <button onClick={onEdit} className="text-gray-300 hover:text-gray-600 p-1">
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

function TrackFormSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: DailyTrack | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const { members } = useMembers();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '✅');
  const [memberId, setMemberId] = useState<string | ''>(initial?.member_id ?? '');
  const [targetCount, setTargetCount] = useState(initial?.target_count ?? 1);
  const [periodUnit, setPeriodUnit] = useState<DailyTrackPeriod>(
    initial?.period_unit ?? 'day',
  );
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? []);
  const [startDate, setStartDate] = useState<string>(initial?.start_date ?? '');
  const [endDate, setEndDate] = useState<string>(initial?.end_date ?? '');
  const [untilCount, setUntilCount] = useState<number | ''>(
    initial?.until_count ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggleWeekday = (d: number) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  };

  const submit = async () => {
    if (!title.trim()) {
      setErr('제목을 입력해주세요.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        household_id: HOUSEHOLD_ID,
        title: title.trim(),
        emoji,
        member_id: memberId || null,
        target_member_ids: memberId ? [memberId] : [],
        target_count: targetCount,
        period_unit: periodUnit,
        weekdays: weekdays.length > 0 ? weekdays : null,
        start_date: startDate || null,
        end_date: endDate || null,
        until_count: untilCount === '' ? null : untilCount,
      };
      const res = isEdit
        ? await fetch(`/api/daily-tracks/${initial.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/daily-tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '실패');
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!isEdit || !initial) return;
    if (!confirm(`"${initial.title}" 항목을 삭제할까요? (체크 기록도 함께 사라집니다)`)) return;
    await fetch(`/api/daily-tracks/${initial.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">{isEdit ? 'Daily Track 수정' : '새 Daily Track'}</h2>
          <button onClick={onClose} className="text-gray-400">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
              className="w-14 px-2 py-2.5 border border-gray-200 rounded-xl text-center text-2xl"
            />
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 약 먹기 / 양치 / 화장실 청소"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">목표 빈도</label>
            <div className="flex items-center gap-2">
              <select
                value={periodUnit}
                onChange={(e) => setPeriodUnit(e.target.value as DailyTrackPeriod)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="day">하루</option>
                <option value="week">주</option>
                <option value="month">월</option>
              </select>
              <input
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(parseInt(e.target.value) || 1)}
                className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-600">회</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              예: 하루 3회 양치, 주 1회 화장실 청소, 월 1회 칫솔 바꾸기
            </div>
          </div>

          {/* 활성 요일 (선택) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">활성 요일 (선택)</label>
            <div className="flex gap-1.5">
              {WEEKDAY_LABELS.map((label, i) => {
                const active = weekdays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleWeekday(i)}
                    className={`flex-1 py-1.5 text-xs rounded-lg ${
                      active
                        ? 'bg-amber-500 text-white font-bold'
                        : 'bg-gray-100 text-gray-500'
                    } ${i === 0 ? '' : ''} ${i === 6 ? '' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              아무 요일도 선택 안 하면 매일 노출. 특정 요일만 누르면 그 요일만.
            </div>
          </div>

          {/* 기간 (선택) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">기간 (선택)</label>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-gray-500">시작</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="w-12 shrink-0 text-xs text-gray-500">종료</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              비워두면 무기한. 기간 지나면 자동 비활성화.
            </div>
          </div>

          {/* 총 횟수 제한 (선택) */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">총 횟수 제한 (선택)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={untilCount}
                onChange={(e) =>
                  setUntilCount(e.target.value === '' ? '' : parseInt(e.target.value) || 1)
                }
                placeholder="(무제한)"
                className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
              <span className="text-sm text-gray-600">회 완료까지만</span>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">
              예: 30회 운동 챌린지. 도달 시 자동 보관.
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">담당</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setMemberId('')}
                className={`px-3 py-1.5 text-xs rounded-full border ${
                  memberId === ''
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                공유
              </button>
              {members.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMemberId(m.id)}
                  className={`px-3 py-1.5 text-xs rounded-full border inline-flex items-center gap-1.5 ${
                    memberId === m.id
                      ? 'border-gray-800 bg-gray-50 text-gray-800 font-semibold'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
          {isEdit && (
            <button
              onClick={remove}
              disabled={busy}
              className="px-4 py-3 rounded-xl bg-rose-50 text-rose-500 text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Trash2 size={16} /> 삭제
            </button>
          )}
          <button
            onClick={submit}
            disabled={busy}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {busy ? '저장 중…' : isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}
