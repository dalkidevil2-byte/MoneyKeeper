export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { isRoutineDueOn, isTaskOverdue } from '@/lib/task-recurrence';
import type { Task, TaskCompletion, TodayTask } from '@/types';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// ─────────────────────────────────────────
// GET /api/tasks/today?date=YYYY-MM-DD
// 오늘(또는 지정일) 해야 할 일 + 지난(미루기) 일을 반환.
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const dateStr = searchParams.get('date') ?? dayjs().tz(KST).format('YYYY-MM-DD');
  const memberId = searchParams.get('member_id');

  const date = dayjs.tz(dateStr, KST);

  try {
    // 활성 task 전체 (cancelled 제외) — 멤버 필터 없이 먼저 조회
    // (overdue 는 모든 멤버 거 다 보이게 하기 위해)
    const { data: allTasksRaw, error } = await supabase
      .from('tasks')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('household_id', householdId)
      .neq('status', 'cancelled')
      .eq('is_active', true)
      .eq('kind', 'event');
    if (error) throw error;

    const allTasks = (allTasksRaw ?? []) as Task[];

    // 멤버 필터 매칭 함수 (today/tomorrow 만 적용, overdue 는 무시)
    const matchesMember = (t: Task): boolean => {
      if (!memberId) return true;
      if (!t.member_id && (!t.target_member_ids || t.target_member_ids.length === 0)) {
        return true; // 공유
      }
      if (t.member_id === memberId) return true;
      if (t.target_member_ids?.includes(memberId)) return true;
      return false;
    };

    // routine 들의 최근 30일 completion 한 번에 조회
    const routineIds = allTasks.filter((t) => t.type === 'routine').map((t) => t.id);
    let completionsMap: Record<string, TaskCompletion[]> = {};
    if (routineIds.length > 0) {
      const since = date.subtract(45, 'day').format('YYYY-MM-DD');
      const { data: completions } = await supabase
        .from('task_completions')
        .select('*')
        .in('task_id', routineIds)
        .gte('completed_on', since);
      for (const c of (completions ?? []) as TaskCompletion[]) {
        (completionsMap[c.task_id] ??= []).push(c);
      }
    }

    const today: TodayTask[] = [];
    const overdue: TodayTask[] = [];
    const tomorrow: TodayTask[] = [];
    const todayKey = date.format('YYYY-MM-DD');
    const tomorrowDate = date.add(1, 'day');
    const tomorrowKey = tomorrowDate.format('YYYY-MM-DD');

    for (const task of allTasks) {
      // overdue 는 멤버 무관 모두 보이게, 그 외는 멤버 필터 적용
      const memberOk = matchesMember(task);

      if (task.type === 'one_time') {
        // 완료된 일회성: due_date 가 오늘/내일인 것만 (취소선 노출)
        if (task.status === 'done') {
          if (!memberOk) continue;
          if (task.due_date === todayKey) {
            today.push({ task, occurrence_date: todayKey, completed_today: true });
          } else if (task.due_date === tomorrowKey) {
            tomorrow.push({ task, occurrence_date: tomorrowKey, completed_today: true });
          }
          continue;
        }
        // snoozed는 snoozed_to가 오늘이면 표시
        const effectiveDate = task.status === 'snoozed' ? task.snoozed_to : task.due_date;
        if (effectiveDate === todayKey && memberOk) {
          today.push({ task, occurrence_date: todayKey, completed_today: false });
        } else if (effectiveDate === tomorrowKey && memberOk) {
          tomorrow.push({ task, occurrence_date: tomorrowKey, completed_today: false });
        } else if (isTaskOverdue(task, todayKey)) {
          overdue.push({
            task,
            occurrence_date: task.due_date ?? todayKey,
            completed_today: false,
          });
        }
      } else {
        // routine — 멤버 매칭 안 되면 스킵 (overdue 개념 없음)
        if (!memberOk) continue;
        const completions = completionsMap[task.id] ?? [];
        if (isRoutineDueOn(task.recurrence, task.due_date, date, completions)) {
          const todayCompletion = completions.find((c) => c.completed_on === todayKey);
          today.push({
            task: { ...task, completions },
            occurrence_date: todayKey,
            completed_today: !!todayCompletion,
            completion_id: todayCompletion?.id,
          });
        }
        if (isRoutineDueOn(task.recurrence, task.due_date, tomorrowDate, completions)) {
          tomorrow.push({
            task: { ...task, completions },
            occurrence_date: tomorrowKey,
            completed_today: false,
          });
        }
      }
    }

    // 정렬: 고정 먼저 (시간 오름차순), 유동 다음 (우선순위 → 생성순)
    const priorityOrder = { high: 0, normal: 1, low: 2 } as const;
    const sortFn = (a: TodayTask, b: TodayTask) => {
      const af = a.task.is_fixed ? 0 : 1;
      const bf = b.task.is_fixed ? 0 : 1;
      if (af !== bf) return af - bf;
      if (a.task.is_fixed && b.task.is_fixed) {
        return (a.task.due_time ?? '99:99').localeCompare(b.task.due_time ?? '99:99');
      }
      const ap = priorityOrder[a.task.priority] ?? 1;
      const bp = priorityOrder[b.task.priority] ?? 1;
      if (ap !== bp) return ap - bp;
      return (a.task.created_at ?? '').localeCompare(b.task.created_at ?? '');
    };
    today.sort(sortFn);
    tomorrow.sort(sortFn);
    overdue.sort((a, b) => (a.task.due_date ?? '').localeCompare(b.task.due_date ?? ''));

    return NextResponse.json({
      date: todayKey,
      today,
      tomorrow,
      overdue,
      counts: {
        today_total: today.length,
        today_done: today.filter((t) => t.completed_today).length,
        tomorrow_total: tomorrow.length,
        overdue: overdue.length,
      },
    });
  } catch (error) {
    console.error('[GET /tasks/today]', error);
    return NextResponse.json({ error: '오늘의 할일을 불러오지 못했습니다.' }, { status: 500 });
  }
}
