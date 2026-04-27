'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, Link2, Link2Off, Repeat as RepeatIcon, Calendar as CalendarIcon } from 'lucide-react';
import dayjs from 'dayjs';
import { useMembers } from '@/hooks/useAccounts';
import { useSaveGoal } from '@/hooks/useGoals';
import { useTasks, useSaveTask } from '@/hooks/useTasks';
import type { Goal, GoalType, Task } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial?: Goal | null;
}

export default function GoalFormSheet({ open, onClose, onSaved, initial }: Props) {
  const isEdit = !!initial;
  const { members } = useMembers();
  const { create, update, remove } = useSaveGoal();

  const [type, setType] = useState<GoalType>('frequency');
  const [title, setTitle] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [memo, setMemo] = useState('');
  const [memberId, setMemberId] = useState<string | ''>('');
  const [freqCount, setFreqCount] = useState<number>(2);
  const [freqPeriod, setFreqPeriod] = useState<'week' | 'month'>('week');
  const [targetValue, setTargetValue] = useState<number>(100);
  const [unit, setUnit] = useState('');
  const [startDate, setStartDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [dueDate, setDueDate] = useState<string>(dayjs().add(1, 'month').format('YYYY-MM-DD'));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 연결 관리용 (수정 모드만)
  const { tasks: allTasks, refetch: refetchTasks } = useTasks();
  const { update: updateTask } = useSaveTask();

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setType(initial.type);
      setTitle(initial.title);
      setEmoji(initial.emoji ?? '🎯');
      setMemo(initial.memo ?? '');
      setMemberId(initial.member_id ?? '');
      setFreqCount(initial.freq_count ?? 2);
      setFreqPeriod(initial.freq_period ?? 'week');
      setTargetValue(Number(initial.target_value ?? 100));
      setUnit(initial.unit ?? '');
      setStartDate(initial.start_date ?? dayjs().format('YYYY-MM-DD'));
      setDueDate(initial.due_date ?? dayjs().add(1, 'month').format('YYYY-MM-DD'));
    } else {
      setType('frequency');
      setTitle('');
      setEmoji('🎯');
      setMemo('');
      setMemberId('');
      setFreqCount(2);
      setFreqPeriod('week');
      setTargetValue(100);
      setUnit('');
      setStartDate(dayjs().format('YYYY-MM-DD'));
      setDueDate(dayjs().add(1, 'month').format('YYYY-MM-DD'));
    }
    setErr(null);
  }, [open, initial]);

  if (!open) return null;

  const submit = async () => {
    setErr(null);
    if (!title.trim()) {
      setErr('제목을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        household_id: HOUSEHOLD_ID,
        type,
        title: title.trim(),
        memo,
        emoji,
        member_id: memberId || null,
        target_member_ids: memberId ? [memberId] : [],
        freq_count: type === 'frequency' ? freqCount : null,
        freq_period: type === 'frequency' ? freqPeriod : null,
        target_value: type === 'quantitative' ? targetValue : null,
        unit: type === 'quantitative' ? unit : '',
        start_date: type === 'deadline' ? startDate : null,
        due_date: type !== 'frequency' ? dueDate : null,
      };
      if (isEdit && initial) {
        await update(initial.id, payload as unknown as Partial<Goal>);
      } else {
        await create(payload);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !initial) return;
    if (!confirm('이 목표를 삭제할까요? (진행 기록도 함께 삭제됩니다)')) return;
    setSaving(true);
    try {
      await remove(initial.id);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const TypeBtn = ({ t, label, sub }: { t: GoalType; label: string; sub: string }) => (
    <button
      type="button"
      onClick={() => setType(t)}
      className={`flex-1 py-2.5 rounded-xl border text-left px-3 ${
        type === t
          ? 'bg-amber-100 border-amber-400 text-amber-800'
          : 'bg-white border-gray-200 text-gray-600'
      }`}
    >
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">{isEdit ? '목표 수정' : '새 목표'}</h2>
          <button onClick={onClose} className="text-gray-400">
            <X size={22} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="flex gap-1.5">
            <TypeBtn t="frequency" label="빈도" sub="주/월 N회" />
            <TypeBtn t="quantitative" label="성취" sub="누적치" />
            <TypeBtn t="deadline" label="마감" sub="기한 프로젝트" />
          </div>

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
              placeholder="목표 제목 (예: 주 2회 운동)"
              className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          {type === 'frequency' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">주/월 단위 목표 횟수</div>
              <div className="flex items-center gap-2">
                <select
                  value={freqPeriod}
                  onChange={(e) => setFreqPeriod(e.target.value as 'week' | 'month')}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="week">매주</option>
                  <option value="month">매월</option>
                </select>
                <input
                  type="number"
                  min={1}
                  value={freqCount}
                  onChange={(e) => setFreqCount(parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <span className="text-sm text-gray-600">회</span>
              </div>
              <div className="text-[11px] text-gray-400">
                💡 이 목표에 루틴/할일을 연결하면 완료할 때마다 자동 집계돼요.
              </div>
            </div>
          )}

          {type === 'quantitative' && (
            <div className="space-y-2">
              <div className="text-xs text-gray-500">목표치 + 단위</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step="0.1"
                  value={targetValue}
                  onChange={(e) => setTargetValue(parseFloat(e.target.value) || 0)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="회 / kg / 권 등"
                  className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
          )}

          {(type === 'deadline' || type === 'quantitative') && (
            <div className="space-y-2">
              {type === 'deadline' && (
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs text-gray-500">시작</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">마감</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
            </div>
          )}

          {/* 담당 */}
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

          {isEdit && initial && <GoalTimeStats goalId={initial.id} />}

          {isEdit && initial && (
            <LinkedTasksSection
              goalId={initial.id}
              tasks={allTasks}
              onLink={async (taskId) => {
                await updateTask(taskId, { goal_id: initial.id } as unknown as Partial<Task>);
                refetchTasks();
                onSaved();
              }}
              onUnlink={async (taskId) => {
                await updateTask(taskId, { goal_id: null } as unknown as Partial<Task>);
                refetchTasks();
                onSaved();
              }}
              onTaskCreated={() => {
                refetchTasks();
                onSaved();
              }}
            />
          )}

          <div>
            <label className="text-xs text-gray-500 mb-1 block">메모 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</div>
          )}
        </div>
        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 relative">
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-3 rounded-xl bg-rose-50 text-rose-500 text-sm font-semibold inline-flex items-center gap-1.5"
            >
              <Trash2 size={16} /> 삭제
            </button>
          )}
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? '저장 중…' : isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 연결된 할일/루틴 섹션 (수정 모드 전용)
// ─────────────────────────────────────────
import TaskFormSheet from './TaskFormSheet';

function LinkedTasksSection({
  goalId,
  tasks,
  onLink,
  onUnlink,
  onTaskCreated,
}: {
  goalId: string;
  tasks: Task[];
  onLink: (taskId: string) => Promise<void>;
  onUnlink: (taskId: string) => Promise<void>;
  onTaskCreated: () => void;
}) {
  const linked = tasks.filter((t) => t.goal_id === goalId);
  const candidates = tasks.filter(
    (t) => t.goal_id == null && t.status !== 'cancelled' && t.is_active,
  );

  const [picking, setPicking] = useState(false);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-500">연결된 할일/루틴 ({linked.length})</label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-[11px] text-indigo-600 font-semibold inline-flex items-center gap-1"
          >
            <Link2 size={12} /> 기존 연결
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-[11px] text-amber-600 font-semibold"
          >
            + 새로 추가
          </button>
        </div>
      </div>

      {linked.length === 0 ? (
        <div className="text-[11px] text-gray-400 py-3 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
          아직 연결된 할일이 없어요. <br />
          <span className="text-gray-500">위 버튼으로 새 루틴을 추가하거나 기존 할일을 연결하세요.</span>
        </div>
      ) : (
        <div className="space-y-1">
          {linked.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 px-2.5 py-2 bg-amber-50/60 rounded-lg border border-amber-100"
            >
              {t.type === 'routine' ? (
                <RepeatIcon size={14} className="text-amber-600 shrink-0" />
              ) : (
                <CalendarIcon size={14} className="text-amber-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800 truncate">{t.title}</div>
                <div className="text-[10px] text-gray-500">
                  {summarizeTask(t)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUnlink(t.id)}
                className="text-rose-400 hover:text-rose-600 p-1"
                aria-label="연결 해제"
                title="연결 해제"
              >
                <Link2Off size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 기존 task 선택 모달 */}
      {picking && (
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/40"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl max-h-[60vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-base font-bold">기존 할일 연결</h3>
              <button onClick={() => setPicking(false)} className="text-gray-400">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {candidates.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">
                  연결 가능한 할일이 없어요.
                </div>
              ) : (
                <div className="space-y-1">
                  {candidates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={async () => {
                        await onLink(t.id);
                        setPicking(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left bg-white border border-gray-100 rounded-lg hover:bg-amber-50"
                    >
                      {t.type === 'routine' ? (
                        <RepeatIcon size={14} className="text-indigo-500 shrink-0" />
                      ) : (
                        <CalendarIcon size={14} className="text-indigo-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-800 truncate">
                          {t.title}
                        </div>
                        <div className="text-[10px] text-gray-500">{summarizeTask(t)}</div>
                      </div>
                      <Link2 size={14} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 새 할일/루틴 만들기 — goal_id 자동 prefill */}
      {showForm && (
        <TaskFormSheet
          open={showForm}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            // task가 goal_id 와 함께 만들어졌으니 task 목록 새로고침
            onTaskCreated();
          }}
          defaults={{ goal_id: goalId, type: 'routine' } as Partial<Task>}
        />
      )}
    </div>
  );
}

function summarizeTask(t: Task): string {
  const parts: string[] = [];
  if (t.type === 'routine') {
    parts.push('루틴');
  } else if (t.due_date) {
    parts.push(t.due_date);
  }
  if (t.is_fixed && t.due_time) parts.push(t.due_time.slice(0, 5));
  return parts.join(' · ');
}

// 목표 소요시간 통계 — 연결된 task 의 work_sessions 합산
function GoalTimeStats({ goalId }: { goalId: string }) {
  const [stats, setStats] = useState<{
    total: number;
    week: number;
    month: number;
  } | null>(null);
  useEffect(() => {
    fetch(`/api/goals/${goalId}`)
      .then((r) => r.json())
      .then((d) => {
        setStats({
          total: d.goal?.time_total_minutes ?? 0,
          week: d.goal?.time_week_minutes ?? 0,
          month: d.goal?.time_month_minutes ?? 0,
        });
      })
      .catch(() => setStats({ total: 0, week: 0, month: 0 }));
  }, [goalId]);
  if (!stats || stats.total === 0) return null;
  const fmt = (m: number) => {
    if (m <= 0) return '0분';
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h === 0) return `${min}분`;
    if (min === 0) return `${h}시간`;
    return `${h}시간 ${min}분`;
  };
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">⏱ 투자한 시간</label>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-center">
          <div className="text-[10px] text-amber-700">이번 주</div>
          <div className="text-sm font-bold text-amber-900 mt-0.5">{fmt(stats.week)}</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-100 text-center">
          <div className="text-[10px] text-amber-700">이번 달</div>
          <div className="text-sm font-bold text-amber-900 mt-0.5">{fmt(stats.month)}</div>
        </div>
        <div className="bg-amber-100 rounded-xl p-2.5 border border-amber-200 text-center">
          <div className="text-[10px] text-amber-800">전체</div>
          <div className="text-sm font-bold text-amber-900 mt-0.5">{fmt(stats.total)}</div>
        </div>
      </div>
    </div>
  );
}
