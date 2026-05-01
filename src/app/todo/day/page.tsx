'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useTasks, useSaveTask } from '@/hooks/useTasks';
import { useTaskClipboard } from '@/hooks/useTaskClipboard';
import { useMembers } from '@/hooks/useAccounts';
import { shouldShowOnDayTimeline, isTaskCompletedOn } from '@/lib/task-recurrence';
import { getHolidaysMap, shortHolidayName } from '@/lib/korean-holidays';
import TaskFormSheet from '@/components/todo/TaskFormSheet';
import type { Task } from '@/types';

dayjs.locale('ko');

const HOUR_HEIGHT = 56; // px per hour
const START_HOUR = 0;   // 그리드 시작 (스크롤 가능)
const END_HOUR = 24;
const DEFAULT_SCROLL_HOUR = 6; // 진입 시 6시로 스크롤
const SNAP_MIN = 30; // 드래그 스냅 (분)

const DEFAULT_COLOR = '#94a3b8';

// "HH:mm" → 분
function timeToMin(s: string | null | undefined): number {
  if (!s) return 0;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}
// 분 → "HH:mm:ss"
function minToTimeStr(min: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

export default function TodoDayPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TodoDayPage />
    </Suspense>
  );
}

function TodoDayPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialDate = sp.get('date') ?? dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState<string>(initialDate);
  const day = dayjs(date);

  const { members } = useMembers();
  const { tasks, refetch: refetchTasks } = useTasks({
    include_completions: true,
  });
  const { tasks: routines, refetch: refetchRoutines } = useTasks({
    type: 'routine',
    include_completions: true,
  });
  const refetch = () => {
    refetchTasks();
    refetchRoutines();
  };
  const { update } = useSaveTask();

  // 키보드 단축키 (Ctrl+C / V / Delete)
  // 붙여넣기 시 현재 보고 있는 날짜 + 마지막 클릭한 시간 라인을 사용
  const lastHourRef = useRef<number | null>(null);
  const { selectedId, select } = useTaskClipboard({
    pasteContext: () => ({
      date,
      time:
        lastHourRef.current != null
          ? `${String(lastHourRef.current).padStart(2, '0')}:00`
          : undefined,
    }),
    onChanged: () => refetch(),
  });

  // 직전 드래그가 실제 이동이었는지 — 직후 click 이벤트 무시용
  const justDraggedRef = useRef(false);

  // 종일 → 시간대 드래그 변환
  const allDayDragRef = useRef<{
    task: Task;
    startX: number;
    startY: number;
    moved: boolean;
    ghostHour: number | null;
  } | null>(null);
  const [allDayGhost, setAllDayGhost] = useState<{
    hour: number;
    minute: number;
  } | null>(null);

  // 드래그 상태 — resize(top/bottom) 또는 move(블록 이동)
  const [drag, setDrag] = useState<{
    taskId: string;
    /** todo 세션이면 session id, event 시간 일정이면 null */
    sessionId: string | null;
    mode: 'resize_top' | 'resize_bottom' | 'move';
    startY: number;
    origStart: number;
    origEnd: number;
    curStart: number;
    curEnd: number;
    /** move 인 경우만: 실제 이동이 시작됐는지 (threshold 통과) — 클릭과 구분 */
    moved?: boolean;
  } | null>(null);

  // 멤버 색
  const memberColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.id, mem.color);
    return m;
  }, [members]);

  const allTasks = useMemo(() => {
    const map = new Map<string, Task>();
    [...tasks, ...routines].forEach((t) => map.set(t.id, t));
    return Array.from(map.values()).filter((t) => shouldShowOnDayTimeline(t, day));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, routines, date]);

  const allDayTasks = allTasks.filter((t) => !t.is_fixed);
  const timedTasks = allTasks.filter((t) => t.is_fixed && t.due_time);

  // 그 날의 todo 세션 (별도 fetch)
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  // 활동 세션 (별도 fetch)
  type ActivitySessionRow = {
    id: string;
    start_at: string;
    end_at: string | null;
    duration_minutes: number | null;
    session_date: string;
    note?: string;
    activity?: { id: string; name: string; emoji?: string; color?: string };
  };
  const [activitySessions, setActivitySessions] = useState<ActivitySessionRow[]>([]);
  const [selectedActSession, setSelectedActSession] = useState<ActivitySessionRow | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks/sessions?from=${date}&to=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setSessions(d.sessions ?? []);
      });
    fetch(`/api/activities/sessions?from=${date}&to=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setActivitySessions(d.sessions ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);
  const refetchSessions = useCallback(() => {
    fetch(`/api/tasks/sessions?from=${date}&to=${date}`)
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []));
    fetch(`/api/activities/sessions?from=${date}&to=${date}`)
      .then((r) => r.json())
      .then((d) => setActivitySessions(d.sessions ?? []));
  }, [date]);

  // 스크롤 ref — 진입 시 6시로
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = DEFAULT_SCROLL_HOUR * HOUR_HEIGHT - 20;
    }
  }, []);

  // 시트
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [prefillStart, setPrefillStart] = useState<string | undefined>();
  const [prefillEnd, setPrefillEnd] = useState<string | undefined>();

  const openCreateAt = (hour: number) => {
    const h = String(hour).padStart(2, '0');
    setEditing(null);
    setPrefillStart(`${h}:00`);
    setPrefillEnd(`${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`);
    setSheetOpen(true);
  };
  const openEdit = (t: Task) => {
    setEditing(t);
    setPrefillStart(undefined);
    setPrefillEnd(undefined);
    setSheetOpen(true);
  };
  const openCreateAllDay = () => {
    setEditing(null);
    setPrefillStart(undefined);
    setPrefillEnd(undefined);
    setSheetOpen(true);
  };

  const getTaskColor = (t: Task): string => {
    if (t.target_member_ids && t.target_member_ids.length > 0) {
      return memberColorMap.get(t.target_member_ids[0]) ?? DEFAULT_COLOR;
    }
    if (t.member_id) return memberColorMap.get(t.member_id) ?? DEFAULT_COLOR;
    return DEFAULT_COLOR;
  };

  // 공휴일
  const holidayMap = useMemo(() => getHolidaysMap(day.year()), [day]);
  const holidays = holidayMap[date] ?? [];

  // 시간 task 위치 계산 — event 시간 일정 + todo 작업 세션 통합
  const timedItems = useMemo(() => {
    type T = {
      task: Task;
      top: number;
      height: number;
      startMin: number;
      endMin: number;
      /** todo 세션이면 session id, event 면 null */
      sessionId: string | null;
      isDone?: boolean;
    };
    const out: T[] = [];

    // event 시간 일정
    for (const t of timedTasks) {
      const [sh, sm] = (t.due_time ?? '00:00').split(':').map(Number);
      const [eh, em] = (t.end_time ?? t.due_time ?? '00:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin = startMin + 60;
      out.push({
        task: t,
        top: (startMin / 60) * HOUR_HEIGHT,
        height: ((endMin - startMin) / 60) * HOUR_HEIGHT,
        startMin,
        endMin,
        sessionId: null,
      });
    }

    // todo 세션 (그 날짜 + start_time 있는 것)
    for (const sRaw of sessions) {
      const s = sRaw as unknown as {
        id: string;
        start_time: string | null;
        end_time: string | null;
        is_done: boolean;
        task: Task | null;
      };
      if (!s.start_time || !s.task) continue;
      const [sh, sm] = s.start_time.split(':').map(Number);
      const [eh, em] = (s.end_time ?? s.start_time).split(':').map(Number);
      const startMin = sh * 60 + sm;
      let endMin = eh * 60 + em;
      if (endMin <= startMin) endMin = startMin + 60;
      out.push({
        task: s.task,
        top: (startMin / 60) * HOUR_HEIGHT,
        height: ((endMin - startMin) / 60) * HOUR_HEIGHT,
        startMin,
        endMin,
        sessionId: s.id,
        isDone: s.is_done,
      });
    }

    return out;
  }, [timedTasks, sessions]);

  // 겹침 처리: 시간이 겹치는 task 끼리 그룹 만들고 lane 배정
  const positioned = useMemo(() => {
    type Item = (typeof timedItems)[number] & { lane: number; lanes: number };
    const sorted = [...timedItems].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const result: Item[] = [];
    // 그룹 단위로 lane 처리
    let group: typeof sorted = [];
    let groupEnd = -1;
    const flushGroup = () => {
      if (group.length === 0) return;
      // lane 배정 (greedy)
      const laneEnds: number[] = [];
      const items: Item[] = [];
      for (const it of group) {
        let lane = laneEnds.findIndex((e) => e <= it.startMin);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(it.endMin);
        } else {
          laneEnds[lane] = it.endMin;
        }
        items.push({ ...it, lane, lanes: 0 });
      }
      const totalLanes = laneEnds.length;
      for (const it of items) it.lanes = totalLanes;
      result.push(...items);
    };
    for (const it of sorted) {
      if (group.length === 0 || it.startMin < groupEnd) {
        group.push(it);
        groupEnd = Math.max(groupEnd, it.endMin);
      } else {
        flushGroup();
        group = [it];
        groupEnd = it.endMin;
      }
    }
    flushGroup();
    return result;
  }, [timedItems]);

  // ── 드래그 시작 ──
  const startDrag = (
    e: React.PointerEvent,
    p: { task: Task; sessionId: string | null; startMin: number; endMin: number },
    mode: 'resize_top' | 'resize_bottom' | 'move'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      taskId: p.task.id,
      sessionId: p.sessionId,
      mode,
      startY: e.clientY,
      origStart: p.startMin,
      origEnd: p.endMin,
      curStart: p.startMin,
      curEnd: p.endMin,
      moved: false,
    });
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (!drag) return;
    const handleMove = (e: PointerEvent) => {
      const dy = e.clientY - drag.startY;
      // 30분 스냅
      const deltaMin = Math.round((dy / HOUR_HEIGHT) * 60 / SNAP_MIN) * SNAP_MIN;
      let curStart = drag.origStart;
      let curEnd = drag.origEnd;
      if (drag.mode === 'resize_top') {
        curStart = Math.max(0, Math.min(drag.origEnd - SNAP_MIN, drag.origStart + deltaMin));
      } else if (drag.mode === 'resize_bottom') {
        curEnd = Math.min(24 * 60, Math.max(drag.origStart + SNAP_MIN, drag.origEnd + deltaMin));
      } else {
        // move — 길이 유지하고 시작/종료 같이 이동
        const length = drag.origEnd - drag.origStart;
        let nextStart = drag.origStart + deltaMin;
        nextStart = Math.max(0, Math.min(24 * 60 - length, nextStart));
        curStart = nextStart;
        curEnd = nextStart + length;
      }
      const moved = drag.moved || Math.abs(dy) > 4;
      setDrag((d) => (d ? { ...d, curStart, curEnd, moved } : d));
    };
    const handleUp = async () => {
      const d = drag;
      setDrag(null);
      if (!d) return;
      // 클릭 수준이거나 변경 없으면 저장 스킵
      if (d.mode === 'move' && !d.moved) return;
      // 실제 이동이면 다음 click 1번 무시 (선택 토글 방지)
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 50);
      if (d.curStart === d.origStart && d.curEnd === d.origEnd) return;
      try {
        if (d.sessionId) {
          // todo 작업 세션 — sessions API
          await fetch(`/api/tasks/${d.taskId}/sessions`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: d.sessionId,
              start_time: minToTimeStr(d.curStart),
              end_time: minToTimeStr(d.curEnd),
            }),
          });
          refetchSessions();
        } else {
          // event 시간 일정 — task API
          await update(d.taskId, {
            is_fixed: true,
            due_time: minToTimeStr(d.curStart),
            end_time: minToTimeStr(d.curEnd),
          });
          refetch();
        }
      } catch (err) {
        console.error('[drag save]', err);
        alert('저장 실패');
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
  }, [drag]);

  // 종일 → 시간대 드래그 변환: 글로벌 pointermove/up
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const drg = allDayDragRef.current;
      if (!drg) return;
      const dx = e.clientX - drg.startX;
      const dy = e.clientY - drg.startY;
      // 4px 이상 움직였을 때 드래그로 판정
      if (!drg.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drg.moved = true;
      // scroll 영역 안인지 + 시간 계산
      const sc = scrollRef.current;
      if (!sc) return;
      const rect = sc.getBoundingClientRect();
      const inGrid =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (inGrid) {
        const yInGrid = e.clientY - rect.top + sc.scrollTop;
        const totalMin = (yInGrid / HOUR_HEIGHT) * 60;
        const snapped = Math.max(0, Math.min(24 * 60 - 30, Math.round(totalMin / 30) * 30));
        const hour = Math.floor(snapped / 60);
        const minute = snapped % 60;
        drg.ghostHour = hour;
        setAllDayGhost({ hour, minute });
      } else {
        drg.ghostHour = null;
        setAllDayGhost(null);
      }
    };
    const handleUp = async () => {
      const drg = allDayDragRef.current;
      allDayDragRef.current = null;
      const ghost = allDayGhost;
      setAllDayGhost(null);
      if (!drg || !drg.moved || drg.ghostHour == null || !ghost) return;
      // 종일 → 1시간 짜리 시간 일정으로 변환
      const startMin = ghost.hour * 60 + ghost.minute;
      const endMin = Math.min(24 * 60, startMin + 60);
      try {
        await update(drg.task.id, {
          is_fixed: true,
          due_time: minToTimeStr(startMin),
          end_time: minToTimeStr(endMin),
        });
        refetch();
      } catch (err) {
        console.error('[allday drag]', err);
        alert('변환 실패');
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
  }, [allDayGhost]);

  // 현재 시각 표시 (오늘일 때만)
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 60_000);
    return () => clearInterval(id);
  }, []);
  const isToday = day.isSame(now, 'day');
  const nowTop = (now.hour() * 60 + now.minute()) / 60 * HOUR_HEIGHT;

  return (
    <div className="min-h-screen bg-white pb-24 flex flex-col">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-2 flex items-center gap-2 border-b border-gray-100">
        <button
          onClick={() => router.push('/todo/calendar')}
          className="p-1.5 text-gray-500"
          aria-label="캘린더로"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 flex items-center justify-center gap-1">
          <button
            onClick={() => setDate(day.subtract(1, 'day').format('YYYY-MM-DD'))}
            className="p-1.5 text-gray-500"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={() => setDate(dayjs().format('YYYY-MM-DD'))}
            className="text-base font-bold flex flex-col items-center"
            title="오늘로"
          >
            <span>{day.format('M월 D일 (ddd)')}</span>
            {holidays.length > 0 && (
              <span className="text-[10px] text-rose-500 font-semibold leading-tight">
                {shortHolidayName(holidays[0].name)}
              </span>
            )}
          </button>
          <button
            onClick={() => setDate(day.add(1, 'day').format('YYYY-MM-DD'))}
            className="p-1.5 text-gray-500"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => router.push(`/todo/calendar?date=${date}`)}
            className="text-[10px] font-semibold text-gray-500 px-2 py-1 active:bg-gray-100 rounded"
            aria-label="월간"
            title="월간 보기"
          >
            월
          </button>
          <button
            onClick={() => router.push(`/todo/week?date=${date}`)}
            className="text-[10px] font-semibold text-gray-500 px-2 py-1 active:bg-gray-100 rounded"
            aria-label="주간"
            title="주간 보기"
          >
            주
          </button>
          <span className="text-[10px] font-semibold bg-amber-500 text-white px-2 py-1 rounded">
            일
          </span>
        </div>
      </div>
      <div className="hidden md:block text-[10px] text-gray-400 px-4 py-1 border-b border-gray-100">
        💡 일정 클릭=선택 · 더블클릭=수정 · Ctrl+C/V · Delete
      </div>

      {/* 종일 영역 */}
      {allDayTasks.length > 0 ? (
        <div className="px-3 py-2 border-b border-gray-100 bg-amber-50/50">
          <div className="text-[10px] text-gray-500 mb-1 font-semibold">
            종일 <span className="text-gray-400 font-normal ml-1">· 드래그하여 시간대로 이동</span>
          </div>
          <div className="flex flex-col gap-1">
            {allDayTasks.map((t) => {
              const completed = isTaskCompletedOn(t, date);
              const isSel = selectedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (allDayDragRef.current?.moved) return; // 드래그 직후 클릭 무시
                    select(t);
                  }}
                  onDoubleClick={() => openEdit(t)}
                  onPointerDown={(e) => {
                    // 좌클릭/터치 만 처리
                    if (e.button !== 0 && e.button !== undefined) return;
                    allDayDragRef.current = {
                      task: t,
                      startX: e.clientX,
                      startY: e.clientY,
                      moved: false,
                      ghostHour: null,
                    };
                    setAllDayGhost(null);
                  }}
                  className={`text-xs text-white text-left px-2 py-1 rounded truncate touch-none ${completed ? 'opacity-50 line-through' : ''} ${isSel ? 'ring-2 ring-blue-400' : ''}`}
                  style={{ backgroundColor: getTaskColor(t), cursor: 'grab' }}
                >
                  {t.title}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={openCreateAllDay}
          className="px-4 py-2 border-b border-gray-100 text-[11px] text-gray-400 text-left bg-white hover:bg-gray-50"
        >
          + 종일 일정 추가
        </button>
      )}

      {/* 타임테이블 (스크롤 영역) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div
          className="relative"
          style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
        >
          {/* 시간 라벨 + 그리드 라인 */}
          {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => {
            const hour = START_HOUR + i;
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <div className="w-12 shrink-0 text-[10px] text-gray-400 text-right pr-2 pt-0.5 select-none">
                  {String(hour).padStart(2, '0')}:00
                </div>
                <button
                  onClick={() => {
                    lastHourRef.current = hour;
                    select(null);
                    openCreateAt(hour);
                  }}
                  onMouseEnter={() => {
                    lastHourRef.current = hour;
                  }}
                  className="flex-1 h-full border-t border-gray-100 hover:bg-amber-50/40 active:bg-amber-100/60 transition-colors"
                  aria-label={`${hour}시 추가`}
                />
              </div>
            );
          })}

          {/* 30분 보조 라인 */}
          {Array.from({ length: END_HOUR - START_HOUR }).map((_, i) => (
            <div
              key={`half-${i}`}
              className="absolute left-12 right-0 border-t border-dashed border-gray-100 pointer-events-none"
              style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
            />
          ))}

          {/* 현재 시각 라인 */}
          {isToday && (
            <div
              className="absolute left-12 right-0 z-20 pointer-events-none"
              style={{ top: nowTop }}
            >
              <div className="relative h-0">
                <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-rose-500" />
                <div className="absolute left-0 right-0 border-t-2 border-rose-500" />
              </div>
            </div>
          )}

          {/* 활동 세션 — 시간 라벨 우측 narrow column (task 영역과 분리) */}
          {activitySessions.map((s) => {
            if (!s.activity || !s.start_at) return null;
            const startDate = new Date(s.start_at);
            const endDate = s.end_at ? new Date(s.end_at) : new Date();
            const startMin = startDate.getHours() * 60 + startDate.getMinutes();
            let endMin = endDate.getHours() * 60 + endDate.getMinutes();
            if (s.end_at && endMin <= startMin) endMin = startMin + 5;
            const isRunning = !s.end_at;
            const heightPx = Math.max(
              ((endMin - startMin) / 60) * HOUR_HEIGHT - 2,
              16,
            );
            return (
              <button
                key={`act-${s.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedActSession(s);
                }}
                className={`absolute rounded text-white text-[10px] leading-tight overflow-hidden shadow-sm border border-white/30 active:opacity-70 ${
                  isRunning ? 'animate-pulse' : ''
                }`}
                style={{
                  top: (startMin / 60) * HOUR_HEIGHT + 1,
                  height: heightPx,
                  left: 50,
                  width: 36,
                  backgroundColor: s.activity.color ?? '#6366f1',
                  zIndex: 5,
                }}
                title={`${s.activity.emoji ?? ''} ${s.activity.name}`}
              >
                {heightPx >= 30 ? (
                  <div className="px-1 py-0.5 truncate text-left">
                    {s.activity.emoji ?? ''} {s.activity.name}
                  </div>
                ) : (
                  <div className="text-center pt-0.5">{s.activity.emoji ?? '⏱'}</div>
                )}
              </button>
            );
          })}

          {/* 시간 task 블록 */}
          {positioned.map((p) => {
            const completed = isTaskCompletedOn(p.task, date);
            const widthPct = 100 / p.lanes;
            const leftPct = widthPct * p.lane;
            // 드래그 중이면 미리보기 위치/높이로 덮어쓰기
            const isDragging =
              drag?.taskId === p.task.id && drag?.sessionId === p.sessionId;
            const top = isDragging
              ? (drag!.curStart / 60) * HOUR_HEIGHT
              : p.top;
            const height = isDragging
              ? ((drag!.curEnd - drag!.curStart) / 60) * HOUR_HEIGHT
              : p.height;
            const startLabel = isDragging
              ? minToTimeStr(drag!.curStart).slice(0, 5)
              : p.task.due_time?.slice(0, 5);
            const endLabel = isDragging
              ? minToTimeStr(drag!.curEnd).slice(0, 5)
              : (p.task.end_time && p.task.end_time !== p.task.due_time
                  ? p.task.end_time.slice(0, 5)
                  : '');
            const isSession = !!p.sessionId;
            const sessionDone = !!p.isDone;
            return (
              <div
                key={p.sessionId ?? p.task.id}
                onClick={(e) => {
                  // 본문 영역 click 으로도 select (single-click)
                  e.stopPropagation();
                  select(p.task);
                }}
                className={`absolute rounded-lg text-white text-left text-[11px] leading-tight overflow-hidden shadow-sm border ${isSession ? 'border-dashed border-white/60' : 'border-white/30'} ${completed || sessionDone ? 'opacity-50 line-through' : ''} ${isDragging ? 'ring-2 ring-white/70 z-30' : ''} ${selectedId === p.task.id ? 'ring-2 ring-blue-400 z-30' : ''}`}
                style={{
                  top: top + 1,
                  height: Math.max(height - 2, 18),
                  left: `calc(${leftPct}% + 90px)`,
                  width: `calc(${widthPct}% - 92px)`,
                  backgroundColor: getTaskColor(p.task),
                  touchAction: 'none',
                }}
                title={p.task.title}
              >
                {/* 위쪽 핸들 */}
                <div
                  onPointerDown={(e) => startDrag(e, p, 'resize_top')}
                  className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center"
                  aria-label="시작 시간 조절"
                >
                  <div className="w-6 h-0.5 rounded bg-white/70" />
                </div>
                {/* 본문 — 드래그=이동, 클릭=선택, 더블클릭=편집 */}
                <div
                  onPointerDown={(e) => startDrag(e, p, 'move')}
                  onClick={(e) => {
                    if (justDraggedRef.current) return;
                    e.stopPropagation();
                    select(p.task);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    openEdit(p.task);
                  }}
                  className="w-full h-full text-left px-1.5 py-1.5 select-none cursor-grab active:cursor-grabbing"
                >
                  <div className="font-semibold truncate">{p.task.title}</div>
                  <div className="text-[9px] opacity-90 truncate">
                    {startLabel}
                    {endLabel ? `~${endLabel}` : ''}
                  </div>
                </div>
                {/* 아래쪽 핸들 */}
                <div
                  onPointerDown={(e) => startDrag(e, p, 'resize_bottom')}
                  className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 flex items-center justify-center"
                  aria-label="종료 시간 조절"
                >
                  <div className="w-6 h-0.5 rounded bg-white/70" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskFormSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSaved={refetch}
        initial={editing}
        defaultDate={date}
        defaultStartTime={prefillStart}
        defaultEndTime={prefillEnd}
        occurrenceDate={date}
      />

      {/* 활동 세션 상세 — 작은 모달 */}
      {selectedActSession && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={() => setSelectedActSession(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pb-3">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-center gap-3 mb-4">
              <span
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-xl"
                style={{ backgroundColor: selectedActSession.activity?.color ?? '#6366f1' }}
              >
                {selectedActSession.activity?.emoji ?? '⏱'}
              </span>
              <div>
                <div className="text-base font-bold text-gray-900">
                  {selectedActSession.activity?.name}
                </div>
                <div className="text-[11px] text-gray-500">
                  {dayjs(selectedActSession.session_date).format('M월 D일 (ddd)')}
                </div>
              </div>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex justify-between">
                <span className="text-gray-500">시작</span>
                <span className="font-semibold tabular-nums">
                  {dayjs(selectedActSession.start_at).format('HH:mm:ss')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">종료</span>
                <span className="font-semibold tabular-nums">
                  {selectedActSession.end_at
                    ? dayjs(selectedActSession.end_at).format('HH:mm:ss')
                    : '진행 중'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">소요시간</span>
                <span className="font-bold text-amber-600">
                  {selectedActSession.duration_minutes != null
                    ? `${Math.floor(selectedActSession.duration_minutes / 60)}시간 ${selectedActSession.duration_minutes % 60}분`
                    : '진행 중'}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={async () => {
                  if (!confirm('이 세션을 삭제할까요?')) return;
                  await fetch(`/api/activities/sessions/${selectedActSession.id}`, {
                    method: 'DELETE',
                  });
                  setSelectedActSession(null);
                  refetchSessions();
                }}
                className="flex-1 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-semibold"
              >
                🗑 삭제
              </button>
              <button
                onClick={() => setSelectedActSession(null)}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
