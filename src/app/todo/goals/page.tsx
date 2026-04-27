'use client';

import { useState } from 'react';
import { Plus, Minus, MoreHorizontal, CheckCircle2, Link2, Clock } from 'lucide-react';
import dayjs from 'dayjs';
import { useGoals, useSaveGoal } from '@/hooks/useGoals';
import GoalFormSheet from '@/components/todo/GoalFormSheet';
import type { Goal } from '@/types';
import { GOAL_TYPE_LABELS } from '@/types';

export default function GoalsPage() {
  const { goals, loading, refetch } = useGoals();
  const { incProgress, decProgress, update } = useSaveGoal();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const active = goals.filter((g) => g.status === 'active');
  const others = goals.filter((g) => g.status !== 'active');

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setSheetOpen(true);
  };

  const inc = async (g: Goal) => {
    await incProgress(g.id);
    refetch();
  };
  const dec = async (g: Goal) => {
    await decProgress(g.id);
    refetch();
  };
  const markAchieved = async (g: Goal) => {
    await update(g.id, {
      status: 'achieved',
      completed_at: new Date().toISOString(),
    } as unknown as Partial<Goal>);
    refetch();
  };
  const reactivate = async (g: Goal) => {
    await update(g.id, { status: 'active', completed_at: null } as unknown as Partial<Goal>);
    refetch();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">목표</h1>
        <p className="text-sm text-gray-500 mt-1">진행 중인 목표를 관리해요</p>
      </div>

      <div className="px-5 space-y-5">
        <section>
          <h2 className="text-sm font-bold text-gray-700 mb-2">진행 중 ({active.length})</h2>
          {loading ? (
            <div className="text-sm text-gray-400 py-8 text-center">불러오는 중…</div>
          ) : active.length === 0 ? (
            <div className="text-sm text-gray-400 py-10 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              목표가 없어요. 우측 하단 + 버튼으로 추가하세요.
            </div>
          ) : (
            <div className="space-y-2">
              {active.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onClick={() => openEdit(g)}
                  onPlus={() => inc(g)}
                  onMinus={() => dec(g)}
                  onAchieve={() => markAchieved(g)}
                />
              ))}
            </div>
          )}
        </section>

        {others.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-400 mb-2">완료/보관 ({others.length})</h2>
            <div className="space-y-2 opacity-70">
              {others.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onClick={() => openEdit(g)}
                  onPlus={() => reactivate(g)}
                  archived
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <GoalFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refetch}
        initial={editing}
      />
    </div>
  );
}

function formatGoalMinutes(m: number): string {
  if (m <= 0) return '0분';
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}분`;
  if (min === 0) return `${h}시간`;
  return `${h}시간 ${min}분`;
}

function GoalCard({
  goal,
  onClick,
  onPlus,
  onMinus,
  onAchieve,
  archived,
}: {
  goal: Goal;
  onClick: () => void;
  onPlus?: () => void;
  onMinus?: () => void;
  onAchieve?: () => void;
  archived?: boolean;
}) {
  const current = goal.current_value ?? 0;
  const target =
    goal.type === 'frequency'
      ? goal.freq_count ?? 0
      : goal.type === 'quantitative'
        ? Number(goal.target_value ?? 0)
        : 0;
  const rate = goal.progress_rate ?? 0;

  const subtitle = (() => {
    if (goal.type === 'frequency') {
      return `${goal.freq_period === 'week' ? '주' : '월'} ${goal.freq_count}회`;
    }
    if (goal.type === 'quantitative') {
      return `${current}/${target}${goal.unit ? ' ' + goal.unit : ''}`;
    }
    if (goal.due_date) {
      const days = dayjs(goal.due_date).diff(dayjs(), 'day');
      return days >= 0 ? `D-${days}` : `D+${-days}`;
    }
    return '';
  })();

  return (
    <div
      className={`bg-white rounded-2xl p-4 border border-gray-100 ${archived ? '' : 'shadow-sm'}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onClick}
          className="text-3xl shrink-0 leading-none"
          aria-label="수정"
        >
          {goal.emoji || '🎯'}
        </button>
        <div className="flex-1 min-w-0" onClick={onClick}>
          <div className="flex items-center gap-2 cursor-pointer">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-bold">
              {GOAL_TYPE_LABELS[goal.type]}
            </span>
            <span className="text-base font-bold text-gray-800 truncate">{goal.title}</span>
            {(goal.linked_task_count ?? 0) > 0 && (
              <span
                className="text-[10px] text-indigo-500 font-bold inline-flex items-center gap-0.5"
                title="연결된 할일/루틴 수"
              >
                <Link2 size={10} />
                {goal.linked_task_count}
              </span>
            )}
            {(goal.time_total_minutes ?? 0) > 0 && (
              <span
                className="text-[10px] text-amber-600 font-bold inline-flex items-center gap-0.5"
                title="연결된 작업 시간 합계"
              >
                <Clock size={10} />
                {formatGoalMinutes(goal.time_total_minutes!)}
              </span>
            )}
            {goal.member && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: goal.member.color }}
                title={goal.member.name}
              />
            )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
        </div>
        <button
          onClick={onClick}
          className="p-1.5 text-gray-300 hover:text-gray-500"
          aria-label="더보기"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* 진행 바 */}
      {goal.type !== 'deadline' && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-gray-500">
              {goal.type === 'frequency'
                ? `이번 ${goal.freq_period === 'week' ? '주' : '달'} ${current}/${target}회`
                : `${current}/${target}${goal.unit ? ' ' + goal.unit : ''}`}
            </span>
            <span className={`font-bold ${rate >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {rate}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${rate >= 100 ? 'bg-emerald-400' : 'bg-amber-400'}`}
              style={{ width: `${Math.min(100, rate)}%` }}
            />
          </div>
        </div>
      )}
      {goal.type === 'deadline' && goal.due_date && (
        <div className="mt-3">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: `${Math.min(100, rate)}%` }}
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            ⏳ {dayjs(goal.due_date).format('YYYY-MM-DD')}
          </div>
        </div>
      )}

      {!archived && (onPlus || onMinus || onAchieve) && (
        <div className="mt-3 flex gap-1.5">
          {onMinus && (
            <button
              onClick={onMinus}
              className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold inline-flex items-center gap-1"
            >
              <Minus size={12} /> -1
            </button>
          )}
          {onPlus && (
            <button
              onClick={onPlus}
              className="flex-1 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1"
            >
              <Plus size={12} /> +1
            </button>
          )}
          {onAchieve && rate >= 100 && goal.type !== 'deadline' && (
            <button
              onClick={onAchieve}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <CheckCircle2 size={12} /> 달성
            </button>
          )}
        </div>
      )}
      {archived && onPlus && (
        <button
          onClick={onPlus}
          className="mt-3 w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold"
        >
          다시 진행
        </button>
      )}
    </div>
  );
}
