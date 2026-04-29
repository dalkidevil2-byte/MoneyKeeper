'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ChevronLeft, ChevronRight, Plus, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import Link from 'next/link';
import { useTasks, useSaveTask } from '@/hooks/useTasks';
import { useTaskClipboard } from '@/hooks/useTaskClipboard';
import { useGCalAutoSync } from '@/hooks/useGCalAutoSync';
import { useMembers } from '@/hooks/useAccounts';
import { shouldShowOnCalendar, isTaskCompletedOn } from '@/lib/task-recurrence';
import { getHolidaysMap, shortHolidayName, type Holiday } from '@/lib/korean-holidays';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import RoutineScopeDialog, { type RoutineScope } from '@/components/todo/RoutineScopeDialog';
import type { Task, Member } from '@/types';

dayjs.locale('ko');

const MAX_CHIPS_PER_CELL = 3; // 셀당 표시할 최대 chip 개수
const DEFAULT_COLOR = '#94a3b8'; // 공유(=담당 없음) 칩 색

export default function TodoCalendarPage() {
  const router = useRouter();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [selected, setSelected] = useState<string>(() => dayjs().format('YYYY-MM-DD'));
  const [memberFilter, setMemberFilter] = useState<string | ''>('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);
  const { members } = useMembers();

  // 기간 일정이 월 밖에서 시작/종료할 수 있어 from/to 필터 없이 전체 fetch
  const { tasks, refetch: refetchTasks } = useTasks({
    member_id: memberFilter || undefined,
    include_completions: true,
  });
  const { tasks: routines, refetch: refetchRoutines } = useTasks({
    type: 'routine',
    member_id: memberFilter || undefined,
    include_completions: true,
  });
  const refetch = () => {
    refetchTasks();
    refetchRoutines();
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  // 키보드 단축키
  const { selectedId, select } = useTaskClipboard({
    pasteContext: () => ({ date: selected }),
    onChanged: () => refetch(),
  });

  const { update, create, remove } = useSaveTask();

  // 진입 시 노션 자동 sync (30분 throttle 은 서버에서)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/todo/notion-sources/auto-sync', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const hasChange = (d.results ?? []).some(
          (r: {
            status: string;
            counts?: { inserted?: number; removed?: number; updated?: number };
          }) =>
            r.status === 'ok' &&
            ((r.counts?.inserted ?? 0) > 0 ||
              (r.counts?.removed ?? 0) > 0 ||
              (r.counts?.updated ?? 0) > 0),
        );
        if (hasChange) refetch();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 진입/포커스/visibility 시 구글 캘린더 자동 sync
  useGCalAutoSync(refetch);

  // chip 드래그 상태
  const [chipDrag, setChipDrag] = useState<{
    task: Task;
    fromDate: string;        // 드래그 시작한 셀 날짜
    targetDate: string | null; // 현재 호버 셀 날짜
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const justDraggedRef = useRef(false);

  // 루틴 드롭 시 범위 묻기
  const [routineDropDialog, setRoutineDropDialog] = useState<null | {
    task: Task;
    fromDate: string;
    targetDate: string;
  }>(null);

  const allTasks = useMemo(() => {
    const map = new Map<string, Task>();
    [...tasks, ...routines].forEach((t) => map.set(t.id, t));
    return Array.from(map.values());
  }, [tasks, routines]);

  // todo 의 deadline 날짜 → 개수 매핑 (점 표시용)
  const todoDeadlinesByDate = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of allTasks) {
      if (t.kind !== 'todo') continue;
      if (t.status === 'cancelled' || t.status === 'done') continue;
      if (!t.deadline_date) continue;
      m[t.deadline_date] = (m[t.deadline_date] ?? 0) + 1;
    }
    return m;
  }, [allTasks]);

  // todo 작업 세션 (월간 fetch) — 캘린더 점 표시용
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, number>>({});
  useEffect(() => {
    const from = month.startOf('month').format('YYYY-MM-DD');
    const to = month.endOf('month').format('YYYY-MM-DD');
    fetch(`/api/tasks/sessions?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => {
        const map: Record<string, number> = {};
        for (const s of d.sessions ?? []) {
          if (!s.session_date) continue;
          map[s.session_date] = (map[s.session_date] ?? 0) + 1;
        }
        setSessionsByDate(map);
      });
  }, [month]);

  // chip 드래그 처리
  const startChipDrag = (e: React.PointerEvent, task: Task, fromDate: string) => {
    e.stopPropagation();
    setChipDrag({
      task,
      fromDate,
      targetDate: null,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  // pointermove 시 hover 한 셀 검출
  useEffect(() => {
    if (!chipDrag) return;
    const handleMove = (e: PointerEvent) => {
      const dx = e.clientX - chipDrag.startX;
      const dy = e.clientY - chipDrag.startY;
      const moved = chipDrag.moved || Math.hypot(dx, dy) > 6;
      // 셀 검출 — data-cell-date 속성으로 마킹
      let targetDate: string | null = null;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      if (el) {
        const cellEl = el.closest('[data-cell-date]') as HTMLElement | null;
        if (cellEl) targetDate = cellEl.dataset.cellDate ?? null;
      }
      setChipDrag((d) => (d ? { ...d, moved, targetDate } : d));
    };
    const handleUp = async () => {
      const d = chipDrag;
      setChipDrag(null);
      if (!d) return;
      if (!d.moved) return;
      if (!d.targetDate || d.targetDate === d.fromDate) return;
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 80);

      // 루틴이면 다이얼로그
      if (d.task.type === 'routine') {
        setRoutineDropDialog({ task: d.task, fromDate: d.fromDate, targetDate: d.targetDate });
        return;
      }
      // 일회성 — 길이 유지하고 시작/종료 날짜 같이 이동
      try {
        const orig = d.task;
        const startD = orig.due_date ? dayjs(orig.due_date) : null;
        const endD = orig.end_date ? dayjs(orig.end_date) : startD;
        const length = startD && endD ? endD.diff(startD, 'day') : 0;
        const newStart = d.targetDate;
        const newEnd = dayjs(newStart).add(length, 'day').format('YYYY-MM-DD');
        await update(orig.id, { due_date: newStart, end_date: newEnd });
        refetch();
      } catch (err) {
        console.error('[chip drag save]', err);
        alert('이동 실패');
      }
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipDrag]);

  // 루틴 드롭 범위 적용
  const applyRoutineDrop = async (scope: RoutineScope) => {
    const d = routineDropDialog;
    setRoutineDropDialog(null);
    if (!d) return;
    const { task, fromDate, targetDate } = d;
    const dayDelta = dayjs(targetDate).diff(dayjs(fromDate), 'day');
    try {
      if (scope === 'this_only') {
        // 그 날만 예외 처리 + 새 일회성 task 생성
        const exists = task.excluded_dates ?? [];
        if (!exists.includes(fromDate)) {
          await update(task.id, {
            excluded_dates: [...exists, fromDate],
          } as unknown as Partial<Task>);
        }
        await create({
          household_id: task.household_id,
          type: 'one_time',
          title: task.title,
          memo: task.memo,
          category_main: task.category_main,
          category_sub: task.category_sub,
          member_id: task.member_id,
          target_member_ids: task.target_member_ids,
          is_fixed: task.is_fixed,
          due_date: targetDate,
          end_date: targetDate,
          due_time: task.due_time,
          end_time: task.end_time,
          priority: task.priority,
          recurrence: null,
        });
      } else if (scope === 'this_and_future') {
        // 원본을 fromDate 직전까지로 자르고 → 새 루틴을 targetDate 부터 시작 (시작일만 옮김)
        const cutoff = dayjs(fromDate).subtract(1, 'day').format('YYYY-MM-DD');
        if (cutoff < (task.due_date ?? '')) {
          await remove(task.id);
        } else {
          await update(task.id, { until_date: cutoff, until_count: null });
        }
        await create({
          household_id: task.household_id,
          type: 'routine',
          title: task.title,
          memo: task.memo,
          category_main: task.category_main,
          category_sub: task.category_sub,
          member_id: task.member_id,
          target_member_ids: task.target_member_ids,
          is_fixed: task.is_fixed,
          due_date: targetDate,
          due_time: task.due_time,
          end_time: task.end_time,
          priority: task.priority,
          recurrence: task.recurrence,
          // until_date 가 절대 날짜이므로 같은 비율로 이동
          until_date: task.until_date
            ? dayjs(task.until_date).add(dayDelta, 'day').format('YYYY-MM-DD')
            : null,
          until_count: task.until_count,
        });
      } else {
        // 전체 — 시작일을 dayDelta 만큼 이동
        const newStart = task.due_date
          ? dayjs(task.due_date).add(dayDelta, 'day').format('YYYY-MM-DD')
          : targetDate;
        const newUntil = task.until_date
          ? dayjs(task.until_date).add(dayDelta, 'day').format('YYYY-MM-DD')
          : null;
        await update(task.id, {
          due_date: newStart,
          until_date: newUntil,
        });
      }
      refetch();
    } catch (err) {
      console.error('[routine drop]', err);
      alert('이동 실패');
    }
  };

  // 공휴일 (현재 월 + 인접 달의 그리드 셀까지 커버)
  const holidaysByDate = useMemo(() => {
    if (!showHolidays) return {};
    const years = new Set<number>([month.year(), month.add(1, 'month').year(), month.subtract(1, 'month').year()]);
    const merged: Record<string, Holiday[]> = {};
    for (const y of years) {
      const m = getHolidaysMap(y);
      for (const k of Object.keys(m)) {
        merged[k] = (merged[k] ?? []).concat(m[k]);
      }
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month.format('YYYY-MM'), showHolidays]);

  // 멤버 ID → 색상 매핑
  const memberColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.id, mem.color);
    return m;
  }, [members]);

  // 그리드 (일요일 시작) — 이전/다음 달 날짜도 채워서 주간 단위로 끊김 없게
  const firstDay = month.startOf('month');
  const startOffset = firstDay.day();
  const daysInMonth = month.daysInMonth();
  const cells: dayjs.Dayjs[] = [];
  // 이전 달 마지막 날짜들로 첫 주 채우기
  if (startOffset > 0) {
    const prev = month.subtract(1, 'month');
    const prevDays = prev.daysInMonth();
    for (let i = startOffset - 1; i >= 0; i--) {
      cells.push(prev.date(prevDays - i));
    }
  }
  // 현재 달
  for (let d = 1; d <= daysInMonth; d++) cells.push(month.date(d));
  // 다음 달로 마지막 주 채우기 (그리드를 7의 배수로)
  const nextMonth = month.add(1, 'month');
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    cells.push(nextMonth.date(nextDay));
    nextDay++;
  }
  // 항상 6주 (42칸) 표시 — 다음 달 일정도 한 주 더 미리보기
  while (cells.length < 42) {
    cells.push(nextMonth.date(nextDay));
    nextDay++;
  }

  // ──────────────────────────────────────
  // 슬롯 할당: 다일 일정도 매 셀에서 같은 row 에 위치하도록
  // ──────────────────────────────────────
  const { slotsByDate, tasksByDate } = useMemo(() => {
    const slots: Record<string, (Task | null)[]> = {};
    const tasks: Record<string, Task[]> = {};

    // 1) 셀별로 표시 대상 task 모으기 (정렬 + 완료 필터)
    for (const cell of cells) {
      if (!cell) continue;
      const key = cell.format('YYYY-MM-DD');
      let list = allTasks.filter((t) => shouldShowOnCalendar(t, cell));
      if (!showCompleted) {
        list = list.filter((t) => !isTaskCompletedOn(t, cell));
      }
      list.sort((a, b) => {
        // 다일 일정 먼저 (안정적 슬롯 확보)
        const aMulti = a.type === 'one_time' && a.end_date && a.end_date !== a.due_date;
        const bMulti = b.type === 'one_time' && b.end_date && b.end_date !== b.due_date;
        if (aMulti !== bMulti) return aMulti ? -1 : 1;
        if (a.is_fixed !== b.is_fixed) return a.is_fixed ? -1 : 1;
        if (a.is_fixed && b.is_fixed) {
          return (a.due_time ?? '99:99').localeCompare(b.due_time ?? '99:99');
        }
        const order = { high: 0, normal: 1, low: 2 } as const;
        return (order[a.priority] ?? 1) - (order[b.priority] ?? 1);
      });
      tasks[key] = list;
    }

    // 2) 슬롯 할당: 다일 일정 먼저 정렬해서 같은 row 차지
    const visibleKeys = new Set(Object.keys(tasks));
    const allVisibleTasks: Task[] = [];
    const seen = new Set<string>();
    for (const key of Object.keys(tasks)) {
      for (const t of tasks[key]) {
        if (!seen.has(t.id)) {
          seen.add(t.id);
          allVisibleTasks.push(t);
        }
      }
    }

    // 다일 → 단일, 시작일 빠른 순으로 정렬해서 슬롯 배정
    allVisibleTasks.sort((a, b) => {
      const aMulti = a.type === 'one_time' && a.end_date && a.end_date !== a.due_date ? 1 : 0;
      const bMulti = b.type === 'one_time' && b.end_date && b.end_date !== b.due_date ? 1 : 0;
      if (aMulti !== bMulti) return bMulti - aMulti;
      return (a.due_date ?? '').localeCompare(b.due_date ?? '');
    });

    for (const task of allVisibleTasks) {
      // 이 task 가 차지하는 visible 날짜들
      const dates: string[] = [];
      for (const key of visibleKeys) {
        if (tasks[key].some((t) => t.id === task.id)) dates.push(key);
      }
      if (dates.length === 0) continue;

      // 모든 dates 에서 비어있는 가장 낮은 슬롯 인덱스 찾기
      let slot = 0;
      // 안전 장치
      for (let safety = 0; safety < 50; safety++) {
        const allFree = dates.every((d) => {
          const arr = slots[d];
          return !arr || arr[slot] === undefined || arr[slot] === null;
        });
        if (allFree) break;
        slot++;
      }

      // 슬롯에 할당
      for (const d of dates) {
        const arr = (slots[d] ??= []);
        while (arr.length <= slot) arr.push(null);
        arr[slot] = task;
      }
    }

    return { slotsByDate: slots, tasksByDate: tasks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTasks, month.format('YYYY-MM'), showCompleted]);

  // tasksByDate 는 슬롯 계산용 (사용 중)
  void tasksByDate;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  // 한 task의 대표 색상: target_member_ids 첫 번째 → member_id → 회색
  const getTaskColor = (t: Task): string => {
    if (t.target_member_ids && t.target_member_ids.length > 0) {
      return memberColorMap.get(t.target_member_ids[0]) ?? DEFAULT_COLOR;
    }
    if (t.member_id) return memberColorMap.get(t.member_id) ?? DEFAULT_COLOR;
    return DEFAULT_COLOR;
  };

  // 셀 안에서 한 task chip 을 렌더 — 다일 일정의 시작/중간/끝 위치까지 처리
  const renderChipForCell = (t: Task, key: string) => {
    const color = getTaskColor(t);
    const completed = isTaskCompletedOn(t, key);
    const isSel = selectedId === t.id;
    const start = t.due_date;
    const end = t.end_date ?? t.due_date;
    const isStart = key === start;
    const isEnd = key === end;
    const isMulti = t.type === 'one_time' && start && end && start !== end;
    const cornerCls = isMulti
      ? isStart && isEnd
        ? 'rounded'
        : isStart
          ? 'rounded-l rounded-r-none'
          : isEnd
            ? 'rounded-r rounded-l-none'
            : 'rounded-none'
      : 'rounded';
    const extendLeft = isMulti && !isStart;
    const extendRight = isMulti && !isEnd;
    // 셀 보더(1px) + selected ring(2px) 모두 덮어야 막대가 매끈하게 이어짐 → 4px(-1) 사용
    const extendCls = `${extendLeft ? '-ml-1' : ''} ${extendRight ? '-mr-1' : ''}`;
    const isDraggingThis = chipDrag?.task.id === t.id && chipDrag.moved;
    return (
      <div
        key={t.id}
        onPointerDown={(e) => {
          // 시작 cell 만 드래그 시작 가능 (다일 일정의 중간/끝에서 끄는 건 비활성)
          if (!isMulti || isStart) {
            startChipDrag(e, t, key);
          }
        }}
        onClick={(e) => {
          if (justDraggedRef.current) return;
          e.stopPropagation();
          select(t);
          setSelected(key);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(t);
          setSheetOpen(true);
        }}
        className={`relative z-20 text-[9px] leading-[12px] px-1 py-0.5 ${cornerCls} ${extendCls} truncate font-medium text-white cursor-grab active:cursor-grabbing ${completed ? 'opacity-50 line-through' : ''} ${isSel ? 'ring-2 ring-blue-400' : ''} ${isDraggingThis ? 'opacity-40' : ''}`}
        style={{ backgroundColor: color, touchAction: 'none' }}
        title={t.title}
      >
        {isMulti && !isStart ? (
          <span className="opacity-0">.</span>
        ) : (
          <>
            {t.is_fixed && t.due_time && (
              <span className="opacity-90 mr-0.5">{t.due_time.slice(0, 5)}</span>
            )}
            {t.title}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-white pb-24">
      <div className="px-4 pt-6 pb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">캘린더</h1>
        {/* 뷰 토글 — 월/주/일 */}
        <div className="inline-flex bg-white border border-gray-200 rounded-full p-0.5 shadow-sm">
          <span className="px-3 py-1.5 text-xs font-semibold rounded-full bg-amber-500 text-white inline-flex items-center gap-1">
            <CalendarDays size={13} /> 월
          </span>
          <Link
            href={`/todo/week?date=${selected}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-full text-gray-500 active:bg-gray-100 inline-flex items-center gap-1"
          >
            <CalendarRange size={13} /> 주
          </Link>
          <Link
            href={`/todo/day?date=${selected}`}
            className="px-3 py-1.5 text-xs font-semibold rounded-full text-gray-500 active:bg-gray-100 inline-flex items-center gap-1"
          >
            <CalendarClock size={13} /> 일
          </Link>
        </div>
      </div>

      {/* 월 네비 */}
      <div className="px-4 flex items-center justify-between mb-2">
        <button
          onClick={() => setMonth((m) => m.subtract(1, 'month'))}
          className="p-1.5 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => {
            setMonth(dayjs().startOf('month'));
            setSelected(dayjs().format('YYYY-MM-DD'));
          }}
          className="text-base font-bold hover:text-amber-600"
          title="오늘로"
        >
          {month.format('YYYY년 M월')}
        </button>
        <button
          onClick={() => setMonth((m) => m.add(1, 'month'))}
          className="p-1.5 text-gray-500"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 필터 — 멤버 + 완료표시 토글 */}
      <div className="px-3 mb-2 flex items-center gap-1.5 overflow-x-auto pb-1">
        <button
          onClick={() => setMemberFilter('')}
          className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border ${
            memberFilter === ''
              ? 'bg-gray-800 text-white border-gray-800'
              : 'bg-white text-gray-600 border-gray-200'
          }`}
        >
          전체
        </button>
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => setMemberFilter(m.id)}
            className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border inline-flex items-center gap-1 ${
              memberFilter === m.id
                ? 'border-gray-800 bg-gray-50 text-gray-800 font-semibold'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
            {m.name}
          </button>
        ))}
        <span className="shrink-0 ml-1 w-px h-4 bg-gray-200" />
        <button
          onClick={() => setShowCompleted((v) => !v)}
          className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border ${
            showCompleted
              ? 'bg-white text-gray-600 border-gray-200'
              : 'bg-amber-100 text-amber-700 border-amber-300 font-semibold'
          }`}
          title="완료된 할일 숨기기"
        >
          {showCompleted ? '완료 표시' : '미완료만'}
        </button>
        <button
          onClick={() => setShowHolidays((v) => !v)}
          className={`shrink-0 px-2.5 py-1 text-[11px] rounded-full border ${
            showHolidays
              ? 'bg-rose-50 text-rose-600 border-rose-200'
              : 'bg-white text-gray-400 border-gray-200'
          }`}
          title="한국 공휴일 표시"
        >
          {showHolidays ? '🇰🇷 공휴일' : '공휴일 OFF'}
        </button>
      </div>

      {/* 그리드 */}
      <div className="px-1.5 mb-4">
        <div className="grid grid-cols-7 gap-px mb-px">
          {DOW.map((d, i) => (
            <div
              key={d}
              className={`text-[11px] text-center font-semibold py-1 ${
                i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border border-gray-200 rounded-lg overflow-hidden">
          {cells.map((cell, idx) => {
            const dow = idx % 7;
            const lastCol = dow === 6;
            const cellBorder = `${lastCol ? '' : 'border-r border-gray-100'} border-b border-gray-100`;

            const key = cell.format('YYYY-MM-DD');
            const slots = slotsByDate[key] ?? [];
            const visibleSlots = slots.slice(0, MAX_CHIPS_PER_CELL);
            const overflow = slots.length - visibleSlots.length;
            const holidayList = holidaysByDate[key] ?? [];
            const isHoliday = holidayList.length > 0;
            const isSelected = key === selected;
            const isToday = key === dayjs().format('YYYY-MM-DD');
            const isOtherMonth = cell.month() !== month.month();
            const isDropTarget =
              chipDrag?.moved && chipDrag.targetDate === key && chipDrag.fromDate !== key;

            return (
              <button
                key={key}
                data-cell-date={key}
                onClick={() => {
                  if (justDraggedRef.current) return;
                  // 같은 날짜 두 번째 탭 → 일간보기로 이동
                  if (selected === key) {
                    router.push(`/todo/day?date=${key}`);
                  } else {
                    setSelected(key);
                  }
                }}
                className={`min-h-[88px] flex flex-col py-1 text-left transition-colors ${cellBorder} ${
                  isOtherMonth ? 'bg-gray-50/60' : 'bg-white'
                } ${
                  isDropTarget ? 'bg-amber-100/80 ring-2 ring-amber-400 ring-inset z-20' : ''
                } ${
                  isSelected ? 'ring-2 ring-amber-400 ring-inset z-10' : ''
                }`}
              >
                {/* 날짜(좌) + todo deadline/session 점(우) — 헤더 높이 고정 (today 동그라미 때문에 셀별 차이 방지) */}
                <div className="flex items-center justify-between mb-0.5 px-1 gap-1 h-5">
                  <span
                    className={`shrink-0 inline-flex items-center justify-center text-[11px] font-semibold ${
                      isToday
                        ? 'w-5 h-5 rounded-full bg-amber-500 text-white'
                        : isHoliday || dow === 0
                          ? isOtherMonth ? 'text-rose-300' : 'text-rose-500'
                          : dow === 6
                            ? isOtherMonth ? 'text-blue-300' : 'text-blue-400'
                            : isOtherMonth ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    {cell.date()}
                  </span>
                  <div className="flex items-center gap-1 min-w-0">
                    {todoDeadlinesByDate[key] ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] text-amber-600 font-bold"
                        title={`할일 마감 ${todoDeadlinesByDate[key]}건`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {todoDeadlinesByDate[key]}
                      </span>
                    ) : null}
                    {sessionsByDate[key] ? (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] text-indigo-500 font-bold"
                        title={`작업 시간 ${sessionsByDate[key]}건`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                        {sessionsByDate[key]}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 공휴일 라벨 (슬롯 위, 별도 라인) */}
                {isHoliday && (
                  <div className="text-[9px] leading-[12px] text-rose-500 font-semibold truncate px-1 mb-0.5">
                    {shortHolidayName(holidayList[0].name)}
                    {holidayList.length > 1 ? ` +${holidayList.length - 1}` : ''}
                  </div>
                )}

                {/* chip 들 — 슬롯 기반 (다일 일정도 같은 row 유지) */}
                {/* overflow-visible: 다일 일정 chip 의 음수 마진(-mx-px) 이 셀 보더 위로 겹쳐서 막대가 끊기지 않도록 */}
                <div className="flex flex-col gap-0.5 flex-1 max-h-[64px] overflow-visible">
                  {visibleSlots.map((t, slotIdx) => {
                    if (!t) {
                      // 빈 슬롯 — 실제 chip 과 같은 height 유지해야 다음 row 의 chip 들이 슬롯 align
                      return (
                        <div
                          key={`empty-${slotIdx}`}
                          className="text-[9px] leading-[12px] px-1 py-0.5 invisible"
                        >
                          .
                        </div>
                      );
                    }
                    return renderChipForCell(t, key);
                  })}
                  {overflow > 0 && (
                    <div className="text-[9px] text-gray-400 px-1 leading-[12px]">
                      +{overflow}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {/* 안내 */}
      <div className="px-5 text-[11px] text-gray-400 mb-2">
        💡 날짜 한 번 더 탭 → 일간 타임테이블
      </div>

      <button
        onClick={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center active:scale-95"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>

      <TaskFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refetch}
        initial={editing}
        defaultDate={selected}
        occurrenceDate={selected}
      />

      {/* 루틴 chip 드롭 시 범위 다이얼로그 */}
      <RoutineScopeDialog
        open={!!routineDropDialog}
        action="수정"
        occurrenceDate={routineDropDialog?.fromDate ?? ''}
        startDate={routineDropDialog?.task.due_date ?? null}
        onClose={() => setRoutineDropDialog(null)}
        onConfirm={(scope) => applyRoutineDrop(scope)}
      />
    </div>
  );
}
