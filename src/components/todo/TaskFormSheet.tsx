'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { useMembers, useCustomCategories } from '@/hooks/useAccounts';
import { useSaveTask } from '@/hooks/useTasks';
import { useGoals } from '@/hooks/useGoals';
import CategoryCombobox from '@/components/CategoryCombobox';
import RoutineFrequencyPicker from './RoutineFrequencyPicker';
import RoutineEndPicker from './RoutineEndPicker';
import RoutineScopeDialog, { type RoutineScope } from './RoutineScopeDialog';
import type { Task, RecurrenceRule, TaskPriority, TaskKind } from '@/types';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** 편집 모드일 때 기존 task */
  initial?: Task | null;
  /** 새로 만들 때 기본 날짜 (오늘) */
  defaultDate?: string;
  /** 새로 만들 때 기본 시작 시간 (HH:mm) — 지정하면 is_fixed=true */
  defaultStartTime?: string;
  /** 새로 만들 때 기본 종료 시간 (HH:mm) */
  defaultEndTime?: string;
  /**
   * 루틴 수정 시 "현재 보고 있는 날짜" — this_and_future 범위 분기 기준.
   * 일간보기에서 열면 그 날짜, 캘린더에서 열면 선택된 날짜.
   */
  occurrenceDate?: string;
  /** 새 일정 생성 시 prefill (자연어 입력 결과 등) */
  defaults?: Partial<Task> | null;
}

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export default function TaskFormSheet({
  open,
  onClose,
  onSaved,
  initial,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  occurrenceDate,
  defaults,
}: Props) {
  const isEdit = !!initial;
  const { members } = useMembers();
  const { categories: customCats, refetch: refetchCats } = useCustomCategories();
  const { create, update, remove } = useSaveTask();

  const [kind, setKind] = useState<TaskKind>('event');
  const [startDateTodo, setStartDateTodo] = useState<string>('');
  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [deadlineTime, setDeadlineTime] = useState<string>('');
  const [type, setType] = useState<'one_time' | 'routine'>('one_time');
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [multiMode, setMultiMode] = useState(false);
  const [isFixed, setIsFixed] = useState(false); // true=시간 지정
  const [dueDate, setDueDate] = useState<string>(defaultDate ?? dayjs().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string>(defaultDate ?? dayjs().format('YYYY-MM-DD'));
  const [dueTime, setDueTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [categoryMain, setCategoryMain] = useState('');
  const [categorySub, setCategorySub] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceRule | null>(null);
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const [untilCount, setUntilCount] = useState<number | null>(null);
  const [goalId, setGoalId] = useState<string | ''>('');
  const { goals: activeGoals } = useGoals('active');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 루틴 범위 다이얼로그 상태
  const [scopeDialog, setScopeDialog] = useState<null | { action: '수정' | '삭제' }>(null);

  // open / initial 변경 시 초기화
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setKind(initial.kind ?? 'event');
      setStartDateTodo(initial.start_date ?? '');
      setDeadlineDate(initial.deadline_date ?? '');
      setDeadlineTime(initial.deadline_time?.slice(0, 5) ?? '');
      setType(initial.type);
      setTitle(initial.title);
      setMemo(initial.memo ?? '');
      // 다중 우선: target_member_ids 가 비어있지 않으면 그것을 사용, 아니면 member_id를 단일로
      const tids =
        initial.target_member_ids && initial.target_member_ids.length > 0
          ? initial.target_member_ids
          : initial.member_id
            ? [initial.member_id]
            : [];
      setSelectedMemberIds(tids);
      setMultiMode(tids.length > 1);
      setIsFixed(initial.is_fixed ?? false);
      setDueDate(initial.due_date ?? dayjs().format('YYYY-MM-DD'));
      setEndDate(initial.end_date ?? initial.due_date ?? dayjs().format('YYYY-MM-DD'));
      setDueTime(initial.due_time?.slice(0, 5) ?? '');
      setEndTime(initial.end_time?.slice(0, 5) ?? '');
      setPriority(initial.priority ?? 'normal');
      setCategoryMain(initial.category_main ?? '');
      setCategorySub(initial.category_sub ?? '');
      setRecurrence(initial.recurrence ?? null);
      setUntilDate(initial.until_date ?? null);
      setUntilCount(initial.until_count ?? null);
      setGoalId(initial.goal_id ?? '');
    } else {
      const d = defaults ?? {};
      setKind((d.kind as TaskKind) ?? 'event');
      setStartDateTodo(d.start_date ?? '');
      setDeadlineDate(d.deadline_date ?? '');
      setDeadlineTime(d.deadline_time?.slice(0, 5) ?? '');
      setType((d.type as 'one_time' | 'routine') ?? 'one_time');
      setTitle(d.title ?? '');
      setMemo(d.memo ?? '');
      const dTids = d.target_member_ids && d.target_member_ids.length > 0
        ? d.target_member_ids
        : d.member_id
          ? [d.member_id]
          : [];
      setSelectedMemberIds(dTids);
      setMultiMode(dTids.length > 1);
      setIsFixed(!!(d.is_fixed ?? defaultStartTime));
      setDueDate(d.due_date ?? defaultDate ?? dayjs().format('YYYY-MM-DD'));
      setEndDate(d.end_date ?? d.due_date ?? defaultDate ?? dayjs().format('YYYY-MM-DD'));
      setDueTime(d.due_time?.slice(0, 5) ?? defaultStartTime ?? '');
      setEndTime(d.end_time?.slice(0, 5) ?? defaultEndTime ?? '');
      setPriority(d.priority ?? 'normal');
      setCategoryMain(d.category_main ?? '');
      setCategorySub(d.category_sub ?? '');
      setRecurrence(d.recurrence ?? { freq: 'daily' });
      setUntilDate(d.until_date ?? null);
      setUntilCount(d.until_count ?? null);
      setGoalId(d.goal_id ?? '');
    }
    setErr(null);
  }, [open, initial, defaultDate, defaultStartTime, defaultEndTime, defaults]);

  if (!open) return null;

  // 카테고리 옵션 (기본 + 사용자 정의)
  const allMains = Array.from(
    new Set([...CATEGORY_MAIN_OPTIONS, ...customCats.map((c) => c.category_main)])
  );
  const subOptions = Array.from(
    new Set([
      ...(CATEGORY_SUB_MAP[categoryMain] ?? []),
      ...customCats
        .filter((c) => c.category_main === categoryMain && c.category_sub)
        .map((c) => c.category_sub),
    ])
  );

  const handleAddMain = async (val: string) => {
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        category_main: val,
        category_sub: '',
      }),
    });
    await refetchCats();
  };
  const handleAddSub = async (val: string) => {
    if (!categoryMain) return;
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        category_main: categoryMain,
        category_sub: val,
      }),
    });
    await refetchCats();
  };

  // 현재 폼 값으로 payload 빌드
  const buildPayload = () => ({
    household_id: HOUSEHOLD_ID,
    kind,
    start_date: kind === 'todo' ? startDateTodo || null : null,
    deadline_date: kind === 'todo' ? deadlineDate || null : null,
    deadline_time: kind === 'todo' ? (deadlineTime ? `${deadlineTime}:00` : null) : null,
    type,
    title: title.trim(),
    memo,
    category_main: categoryMain,
    category_sub: categorySub,
    member_id: selectedMemberIds[0] ?? null,
    target_member_ids: selectedMemberIds,
    is_fixed: isFixed,
    due_date: dueDate || null,
    end_date: type === 'one_time' ? (endDate || dueDate || null) : null,
    due_time: isFixed ? dueTime || null : null,
    end_time:
      isFixed && type === 'one_time' ? endTime || null : isFixed ? endTime || null : null,
    priority,
    recurrence: type === 'routine' ? recurrence : null,
    until_date: type === 'routine' ? untilDate : null,
    until_count: type === 'routine' ? untilCount : null,
    goal_id: goalId || null,
  });

  // 실제 저장 실행 — scope 가 routine 수정에서만 의미 있음
  const performSave = async (scope: RoutineScope | 'single' = 'single') => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit && initial) {
        if (initial.type === 'routine' && scope === 'this_only' && occurrenceDate) {
          // 1) 원본 루틴의 그 날만 예외 처리
          const exists = initial.excluded_dates ?? [];
          if (!exists.includes(occurrenceDate)) {
            await update(initial.id, {
              excluded_dates: [...exists, occurrenceDate],
            } as unknown as Partial<Task>);
          }
          // 2) 그 날짜에 일회성 일정으로 새로 만듦 (변경 내용 적용)
          await create({
            ...payload,
            type: 'one_time',
            due_date: occurrenceDate,
            end_date: occurrenceDate,
            recurrence: null,
            until_date: null,
            until_count: null,
          });
        } else if (initial.type === 'routine' && scope === 'this_and_future' && occurrenceDate) {
          // 1) 원본을 occurrenceDate 직전까지로 잘라냄
          const cutoff = dayjs(occurrenceDate).subtract(1, 'day').format('YYYY-MM-DD');
          if (cutoff < (initial.due_date ?? '')) {
            // occurrenceDate 가 시작일과 같음 → 원본 자체를 cancel
            await remove(initial.id);
          } else {
            // until_date 단축 + until_count 끄기
            await update(initial.id, { until_date: cutoff, until_count: null });
          }
          // 2) 새 루틴을 occurrenceDate 부터 시작으로 생성 (사용자가 입력한 종료 조건 그대로)
          await create({
            ...payload,
            due_date: occurrenceDate,
          });
        } else {
          // 'all' 또는 단일/일회성
          await update(initial.id, payload as unknown as Partial<Task>);
        }
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

  const submit = async () => {
    setErr(null);
    if (!title.trim()) {
      setErr('제목을 입력해주세요.');
      return;
    }
    if (isFixed && !dueTime) {
      setErr('시간 지정 일정은 시작 시간이 필요합니다.');
      return;
    }
    if (type === 'one_time' && endDate && dueDate && endDate < dueDate) {
      setErr('종료일이 시작일보다 빠를 수 없습니다.');
      return;
    }
    if (type === 'routine' && !recurrence) {
      setErr('루틴 반복 규칙을 선택해주세요.');
      return;
    }
    // 루틴 수정이면 항상 범위 묻기
    if (isEdit && initial && initial.type === 'routine' && occurrenceDate) {
      setScopeDialog({ action: '수정' });
      return;
    }
    await performSave('all');
  };

  // 실제 삭제 실행
  const performDelete = async (scope: RoutineScope | 'single' = 'single') => {
    if (!isEdit || !initial) return;
    setSaving(true);
    try {
      if (initial.type === 'routine' && scope === 'this_only' && occurrenceDate) {
        // 이 날짜만 — excluded_dates 에 추가
        const exists = initial.excluded_dates ?? [];
        if (!exists.includes(occurrenceDate)) {
          await update(initial.id, {
            excluded_dates: [...exists, occurrenceDate],
          } as unknown as Partial<Task>);
        }
      } else if (initial.type === 'routine' && scope === 'this_and_future' && occurrenceDate) {
        const cutoff = dayjs(occurrenceDate).subtract(1, 'day').format('YYYY-MM-DD');
        if (cutoff < (initial.due_date ?? '')) {
          await remove(initial.id);
        } else {
          await update(initial.id, {
            until_date: cutoff,
            until_count: null,
          });
        }
      } else {
        await remove(initial.id);
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit || !initial) return;
    // 루틴이면 항상 범위 묻기 (시작일 포함)
    if (initial.type === 'routine' && occurrenceDate) {
      setScopeDialog({ action: '삭제' });
      return;
    }
    if (!confirm('이 할일을 삭제할까요? (취소 처리됩니다)')) return;
    await performDelete('all');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold">{isEdit ? '할일 수정' : '할일 추가'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={22} />
          </button>
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* kind 토글 — 일정/할일 */}
          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setKind('event');
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
                kind === 'event'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              📅 일정
            </button>
            <button
              type="button"
              onClick={() => {
                setKind('todo');
                // 할일은 단일 + 종일 기본
                setType('one_time');
                setIsFixed(false);
                if (!deadlineDate) setDeadlineDate(dueDate || dayjs().format('YYYY-MM-DD'));
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${
                kind === 'todo'
                  ? 'bg-white text-amber-600 shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              ✅ 할일
            </button>
          </div>
          <div className="text-[11px] text-gray-400 -mt-2 px-1">
            {kind === 'event'
              ? '특정 날짜·시간에 해야 하는 일정 (캘린더에 표시)'
              : '기한까지 끝내면 되는 할일 (할일 리스트에서 임박순 정렬)'}
          </div>

          {/* 타입 토글 — event 일 때만 일회성/루틴 선택 */}
          {kind === 'event' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType('one_time')}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border ${
                type === 'one_time'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              일회성
            </button>
            <button
              type="button"
              onClick={() => {
                setType('routine');
                if (!recurrence) setRecurrence({ freq: 'daily' });
              }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border ${
                type === 'routine'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
            >
              루틴
            </button>
          </div>
          )}

          {/* 제목 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 약 먹기 / 화초 물주기"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* todo 모드 — 시작일/기한 입력 */}
          {kind === 'todo' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">시작일</span>
                <input
                  type="date"
                  value={startDateTodo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDateTodo(v);
                    if (deadlineDate && v && deadlineDate < v) setDeadlineDate(v);
                  }}
                  placeholder="(선택)"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">기한</span>
                <input
                  type="date"
                  value={deadlineDate}
                  min={startDateTodo || undefined}
                  onChange={(e) => setDeadlineDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
                <input
                  type="time"
                  value={deadlineTime}
                  onChange={(e) => setDeadlineTime(e.target.value)}
                  className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              <div className="text-[11px] text-gray-400">
                💡 시작일은 "이때부터 할 수 있다" 의미예요. 비워둬도 됩니다.
              </div>
            </div>
          )}

          {/* 종일 / 시간 지정 토글 — event 전용 */}
          {kind === 'event' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIsFixed(false)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border ${
                !isFixed
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              종일
            </button>
            <button
              type="button"
              onClick={() => setIsFixed(true)}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border ${
                isFixed
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              시간 지정
            </button>
          </div>
          )}

          {/* 시작 / 종료 (one_time = 기간, routine = 시작일만) — event 전용 */}
          {kind === 'event' && (type === 'one_time' ? (
            <div className="space-y-2">
              {/* 시작 */}
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">시작</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    if (endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
                {isFixed && (
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                )}
              </div>
              {/* 종료 */}
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">종료</span>
                <input
                  type="date"
                  value={endDate}
                  min={dueDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
                {isFixed && (
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-28 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                )}
              </div>
              {dueDate !== endDate && (
                <div className="text-[11px] text-amber-600">
                  📅 {dayjs(endDate).diff(dayjs(dueDate), 'day') + 1}일 일정
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-xs text-gray-500">시작일</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                />
              </div>
              {isFixed && (
                <div className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs text-gray-500">시간</span>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                  <span className="text-xs text-gray-400">~</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
                  />
                </div>
              )}
            </div>
          ))}

          {/* 루틴 빈도 — event + routine 일 때만 */}
          {kind === 'event' && type === 'routine' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">반복 규칙</label>
                <RoutineFrequencyPicker
                  value={recurrence}
                  onChange={setRecurrence}
                  startDate={dueDate}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">종료 조건</label>
                <RoutineEndPicker
                  untilDate={untilDate}
                  untilCount={untilCount}
                  onChange={(d, c) => {
                    setUntilDate(d);
                    setUntilCount(c);
                  }}
                  startDate={dueDate}
                />
              </div>
            </div>
          )}

          {/* 담당 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">담당</label>
              <button
                type="button"
                onClick={() => {
                  // 다중 → 단일 전환 시 선택 첫 번째만 유지
                  setMultiMode((prev) => {
                    const next = !prev;
                    if (!next && selectedMemberIds.length > 1) {
                      setSelectedMemberIds(selectedMemberIds.slice(0, 1));
                    }
                    return next;
                  });
                }}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  multiMode
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-500 border-gray-200'
                }`}
              >
                다중 {multiMode ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedMemberIds([])}
                className={`px-3 py-1.5 text-xs rounded-full border ${
                  selectedMemberIds.length === 0
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                공유
              </button>
              {members.map((m) => {
                const checked = selectedMemberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      if (multiMode) {
                        setSelectedMemberIds((prev) =>
                          prev.includes(m.id)
                            ? prev.filter((x) => x !== m.id)
                            : [...prev, m.id]
                        );
                      } else {
                        setSelectedMemberIds(checked ? [] : [m.id]);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border inline-flex items-center gap-1.5 transition-colors ${
                      checked
                        ? 'text-white font-semibold'
                        : 'bg-white text-gray-600 border-gray-200'
                    }`}
                    style={
                      checked
                        ? { backgroundColor: m.color, borderColor: m.color }
                        : undefined
                    }
                  >
                    {!checked && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: m.color }}
                      />
                    )}
                    {m.name}
                    {checked && multiMode && (
                      <span className="text-[10px] opacity-90">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
            {multiMode && selectedMemberIds.length > 1 && (
              <div className="text-[11px] text-indigo-500 mt-1">
                {selectedMemberIds.length}명 선택됨 (예: 부모님 셋 다 탭)
              </div>
            )}
          </div>

          {/* 우선순위 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">우선순위</label>
            <div className="flex gap-1.5">
              {(['low', 'normal', 'high'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`flex-1 py-1.5 text-xs rounded-lg ${
                    priority === p
                      ? p === 'high'
                        ? 'bg-rose-500 text-white'
                        : p === 'low'
                          ? 'bg-gray-300 text-gray-700'
                          : 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {p === 'low' ? '낮음' : p === 'high' ? '높음' : '보통'}
                </button>
              ))}
            </div>
          </div>

          {/* 카테고리 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">대분류</label>
              <CategoryCombobox
                value={categoryMain}
                onChange={(v) => {
                  setCategoryMain(v);
                  setCategorySub('');
                }}
                options={allMains}
                placeholder="선택"
                onAddOption={handleAddMain}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">소분류</label>
              <CategoryCombobox
                value={categorySub}
                onChange={setCategorySub}
                options={subOptions}
                placeholder={categoryMain ? '선택' : '대분류 먼저'}
                disabled={!categoryMain}
                onAddOption={handleAddSub}
              />
            </div>
          </div>

          {/* 목표 연결 */}
          {activeGoals.length > 0 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">목표 연결 (선택)</label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white"
              >
                <option value="">(연결 없음)</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.emoji} {g.title}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-gray-400 mt-1">
                완료할 때마다 이 목표의 진행률이 자동으로 +1 됩니다.
              </div>
            </div>
          )}

          {/* 체크리스트 (수정 모드 전용) */}
          {isEdit && initial && <ChecklistSection taskId={initial.id} />}

          {/* 작업 세션 (todo + 수정 모드 전용) */}
          {isEdit && initial && kind === 'todo' && (
            <WorkSessionsSection taskId={initial.id} />
          )}

          {/* 메모 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">메모 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="필요한 메모"
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {err && (
            <div className="text-sm text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{err}</div>
          )}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-gray-100 flex gap-2">
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
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? '저장 중…' : isEdit ? '수정' : '추가'}
          </button>
        </div>
      </div>

      {/* 루틴 범위 다이얼로그 */}
      <RoutineScopeDialog
        open={!!scopeDialog}
        action={scopeDialog?.action ?? '수정'}
        occurrenceDate={occurrenceDate ?? dueDate}
        startDate={initial?.due_date ?? null}
        onClose={() => setScopeDialog(null)}
        onConfirm={(scope) => {
          const action = scopeDialog?.action;
          setScopeDialog(null);
          if (action === '수정') performSave(scope);
          else performDelete(scope);
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 체크리스트 섹션 (수정 모드 전용)
// ─────────────────────────────────────────
import type { TaskChecklistItem, TaskWorkSession } from '@/types';
import { Plus as PlusIcon, Trash2 as Trash2Icon, Clock as ClockIcon } from 'lucide-react';

function ChecklistSection({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/tasks/${taskId}/checklist`);
    const data = await res.json();
    setItems(data.items ?? []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const add = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => [...prev, data.item]);
        setNewTitle('');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (it: TaskChecklistItem) => {
    setItems((prev) =>
      prev.map((x) => (x.id === it.id ? { ...x, is_done: !it.is_done } : x)),
    );
    await fetch(`/api/tasks/${taskId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: it.id, is_done: !it.is_done }),
    });
  };

  const rename = async (it: TaskChecklistItem, title: string) => {
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, title } : x)));
    await fetch(`/api/tasks/${taskId}/checklist`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: it.id, title }),
    });
  };

  const remove = async (it: TaskChecklistItem) => {
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    await fetch(`/api/tasks/${taskId}/checklist?item_id=${it.id}`, {
      method: 'DELETE',
    });
  };

  const doneCount = items.filter((x) => x.is_done).length;

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
        <span>체크리스트 ({doneCount}/{items.length})</span>
      </label>
      <div className="space-y-1.5">
        {items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-2 px-2 py-1.5 bg-white border border-gray-100 rounded-lg"
          >
            <button
              type="button"
              onClick={() => toggle(it)}
              className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                it.is_done
                  ? 'bg-amber-500 border-amber-500 text-white'
                  : 'border-gray-300 hover:border-amber-400'
              }`}
              aria-label={it.is_done ? '해제' : '완료'}
            >
              {it.is_done && (
                <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 7.5L6 10.5L11 4.5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <input
              type="text"
              value={it.title}
              onChange={(e) => rename(it, e.target.value)}
              className={`flex-1 bg-transparent text-sm focus:outline-none ${
                it.is_done ? 'line-through text-gray-400' : 'text-gray-800'
              }`}
            />
            <button
              type="button"
              onClick={() => remove(it)}
              className="text-gray-300 hover:text-rose-500 p-1"
              aria-label="삭제"
            >
              <Trash2Icon size={13} />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 px-2">
          <PlusIcon size={14} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="체크 항목 추가"
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-400"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy || !newTitle.trim()}
            className="text-xs text-indigo-600 font-semibold disabled:opacity-30"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 작업 세션 섹션 — todo 의 "실제로 할 시간" 슬롯
// ─────────────────────────────────────────
function WorkSessionsSection({ taskId }: { taskId: string }) {
  const [sessions, setSessions] = useState<TaskWorkSession[]>([]);
  const [busy, setBusy] = useState(false);
  const todayStr = dayjs().format('YYYY-MM-DD');

  const load = async () => {
    const res = await fetch(`/api/tasks/${taskId}/sessions`);
    const data = await res.json();
    setSessions(data.sessions ?? []);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const addSession = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_date: todayStr,
          start_time: '14:00:00',
          end_time: '15:00:00',
        }),
      });
      const data = await res.json();
      if (res.ok) setSessions((prev) => [...prev, data.session]);
    } finally {
      setBusy(false);
    }
  };

  const updateSession = async (s: TaskWorkSession, patch: Partial<TaskWorkSession>) => {
    setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)));
    await fetch(`/api/tasks/${taskId}/sessions`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: s.id, ...patch }),
    });
  };

  const removeSession = async (s: TaskWorkSession) => {
    setSessions((prev) => prev.filter((x) => x.id !== s.id));
    await fetch(`/api/tasks/${taskId}/sessions?session_id=${s.id}`, { method: 'DELETE' });
  };

  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <ClockIcon size={12} /> 작업 시간 ({sessions.length})
        </span>
        <button
          type="button"
          onClick={addSession}
          disabled={busy}
          className="text-[11px] text-indigo-600 font-semibold inline-flex items-center gap-0.5"
        >
          <PlusIcon size={11} /> 시간 슬롯 추가
        </button>
      </label>
      {sessions.length === 0 ? (
        <div className="text-[11px] text-gray-400 py-3 text-center bg-gray-50 rounded-lg border border-dashed border-gray-200">
          아직 작업 시간이 없어요. <br />
          <span className="text-gray-500">언제 할지 시간 슬롯을 추가하면 일간 타임테이블에 보여요.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 px-2 py-1.5 bg-amber-50/60 rounded-lg border border-amber-100"
            >
              <button
                type="button"
                onClick={() => updateSession(s, { is_done: !s.is_done })}
                className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                  s.is_done
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'border-gray-300 hover:border-amber-400'
                }`}
                aria-label={s.is_done ? '해제' : '완료'}
              >
                {s.is_done && (
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M3 7.5L6 10.5L11 4.5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <input
                type="date"
                value={s.session_date}
                onChange={(e) => updateSession(s, { session_date: e.target.value })}
                className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
              />
              <input
                type="time"
                value={s.start_time?.slice(0, 5) ?? ''}
                onChange={(e) =>
                  updateSession(s, {
                    start_time: e.target.value ? `${e.target.value}:00` : null,
                  })
                }
                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded bg-white"
              />
              <span className="text-xs text-gray-400">~</span>
              <input
                type="time"
                value={s.end_time?.slice(0, 5) ?? ''}
                onChange={(e) =>
                  updateSession(s, {
                    end_time: e.target.value ? `${e.target.value}:00` : null,
                  })
                }
                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded bg-white"
              />
              <button
                type="button"
                onClick={() => removeSession(s)}
                className="text-gray-300 hover:text-rose-500 p-1"
                aria-label="삭제"
              >
                <Trash2Icon size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
