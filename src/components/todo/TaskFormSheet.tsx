'use client';

import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { useMembers, useCustomCategories } from '@/hooks/useAccounts';
import { useSaveTask } from '@/hooks/useTasks';
import CategoryCombobox from '@/components/CategoryCombobox';
import RoutineFrequencyPicker from './RoutineFrequencyPicker';
import RoutineEndPicker from './RoutineEndPicker';
import RoutineScopeDialog, { type RoutineScope } from './RoutineScopeDialog';
import type { Task, RecurrenceRule, TaskPriority } from '@/types';
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
}: Props) {
  const isEdit = !!initial;
  const { members } = useMembers();
  const { categories: customCats, refetch: refetchCats } = useCustomCategories();
  const { create, update, remove } = useSaveTask();

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
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 루틴 범위 다이얼로그 상태
  const [scopeDialog, setScopeDialog] = useState<null | { action: '수정' | '삭제' }>(null);

  // open / initial 변경 시 초기화
  useEffect(() => {
    if (!open) return;
    if (initial) {
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
    } else {
      setType('one_time');
      setTitle('');
      setMemo('');
      setSelectedMemberIds([]);
      setMultiMode(false);
      setIsFixed(!!defaultStartTime);
      setDueDate(defaultDate ?? dayjs().format('YYYY-MM-DD'));
      setEndDate(defaultDate ?? dayjs().format('YYYY-MM-DD'));
      setDueTime(defaultStartTime ?? '');
      setEndTime(defaultEndTime ?? '');
      setPriority('normal');
      setCategoryMain('');
      setCategorySub('');
      setRecurrence({ freq: 'daily' });
      setUntilDate(null);
      setUntilCount(null);
    }
    setErr(null);
  }, [open, initial, defaultDate, defaultStartTime, defaultEndTime]);

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
          {/* 타입 토글 */}
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

          {/* 종일 / 시간 지정 토글 */}
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

          {/* 시작 / 종료 (one_time = 기간, routine = 시작일만) */}
          {type === 'one_time' ? (
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
          )}

          {/* 루틴 빈도 */}
          {type === 'routine' && (
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
