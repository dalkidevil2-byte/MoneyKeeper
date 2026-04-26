import dayjs, { type Dayjs } from 'dayjs';
import type { RecurrenceRule, Task, TaskCompletion } from '@/types';
import { isSameLunarMonthDay, isSameLunarDay } from './lunar';

// ─────────────────────────────────────────
// 루틴 매칭/평가 유틸
// ─────────────────────────────────────────

/**
 * 주어진 루틴 규칙과 시작일(due_date)을 기준으로,
 * 특정 날짜에 이 루틴이 "오늘 해야 하는 일"로 노출되어야 하는지 판단.
 *
 * - daily: 매일
 * - weekly: weekdays 배열에 dayjs.day() (0=일~6=토)가 포함되면 표시
 * - interval: (date - start) % every_days === 0
 * - count_per_period: 해당 기간(주/월) 내 완료 수가 count 미만이면 표시
 *   (period 시작일 기준 오늘까지 평가)
 */
export function isRoutineDueOn(
  rule: RecurrenceRule | null,
  startDate: Dayjs | string | null,
  date: Dayjs | string,
  completions: TaskCompletion[] = [],
): boolean {
  if (!rule) return false;
  const target = dayjs(date).startOf('day');
  const start = startDate ? dayjs(startDate).startOf('day') : null;

  // 시작일 이전에는 노출하지 않음
  if (start && target.isBefore(start)) return false;

  switch (rule.freq) {
    case 'daily':
      return true;

    case 'weekly': {
      const dow = target.day(); // 0=일
      return rule.weekdays?.includes(dow) ?? false;
    }

    case 'monthly': {
      if (!start) return false;
      if (rule.lunar) return isSameLunarDay(start, target);
      return target.date() === start.date();
    }

    case 'yearly': {
      if (!start) return false;
      if (rule.lunar) return isSameLunarMonthDay(start, target);
      return target.date() === start.date() && target.month() === start.month();
    }

    case 'interval': {
      if (!start) return false;
      if (!rule.every_days || rule.every_days <= 0) return false;
      const diff = target.diff(start, 'day');
      return diff >= 0 && diff % rule.every_days === 0;
    }

    case 'count_per_period': {
      if (!rule.count || rule.count <= 0) return false;
      const periodStart =
        rule.period === 'week' ? target.startOf('week') : target.startOf('month');
      const doneInPeriod = completions.filter((c) => {
        const d = dayjs(c.completed_on);
        return d.isSame(periodStart, 'day') || d.isAfter(periodStart);
      }).length;
      // 이미 목표 횟수만큼 완료했으면 더 이상 표시하지 않음
      return doneInPeriod < rule.count;
    }

    default:
      return false;
  }
}

/**
 * 한 task가 특정 날짜에 "오늘의 할일"로 노출되어야 하는지.
 * one_time / routine 모두 처리. 기간(end_date) + until 종료조건 지원.
 */
export function isTaskDueOn(task: Task, date: Dayjs | string): boolean {
  if (!task.is_active) return false;
  if (task.status === 'cancelled') return false;

  const target = dayjs(date).format('YYYY-MM-DD');

  if (task.type === 'one_time') {
    if (task.status === 'done') return false;
    if (task.status === 'snoozed' && task.snoozed_to) {
      return task.snoozed_to === target;
    }
    if (!task.due_date) return false;
    const start = task.due_date;
    const end = task.end_date ?? task.due_date;
    return target >= start && target <= end;
  }

  // routine — 종료/예외 조건 체크
  if (task.until_date && target > task.until_date) return false;
  if (task.excluded_dates?.includes(target)) return false;
  if (task.until_count != null && task.recurrence && task.due_date) {
    const eff = computeUntilCountEndDate(task.recurrence, task.due_date, task.until_count);
    if (eff && target > eff) return false;
  }
  return isRoutineDueOn(task.recurrence, task.due_date, date, task.completions ?? []);
}

/**
 * "N번째 occurrence 의 양력 날짜" 를 계산.
 * count_per_period 는 의미가 모호해서 null 반환 (until_count 무시).
 */
function computeUntilCountEndDate(
  rule: RecurrenceRule,
  startDate: string,
  count: number,
): string | null {
  if (count <= 0) return startDate;
  const start = dayjs(startDate);
  switch (rule.freq) {
    case 'daily':
      return start.add(count - 1, 'day').format('YYYY-MM-DD');
    case 'weekly': {
      const wds = rule.weekdays ?? [];
      if (wds.length === 0) return startDate;
      let cnt = 0;
      let d = start;
      // 안전장치: count*7 + 14일 안에 못 찾으면 포기
      for (let i = 0; i < count * 7 + 14; i++) {
        if (wds.includes(d.day())) {
          cnt++;
          if (cnt === count) return d.format('YYYY-MM-DD');
        }
        d = d.add(1, 'day');
      }
      return null;
    }
    case 'monthly':
      return start.add(count - 1, 'month').format('YYYY-MM-DD');
    case 'yearly':
      return start.add(count - 1, 'year').format('YYYY-MM-DD');
    case 'interval':
      return start.add((count - 1) * (rule.every_days || 1), 'day').format('YYYY-MM-DD');
    case 'count_per_period':
      // 빈도 자체가 횟수형 — until_count 적용 안 함
      return null;
  }
}

/**
 * 캘린더 표시 전용 — 완료된 일회성도 원래 날짜에 남기고,
 * 루틴은 매칭일 + 완료일 모두 표시 (단, 종료 조건 후엔 숨김).
 */
export function shouldShowOnCalendar(task: Task, date: Dayjs | string): boolean {
  if (!task.is_active) return false;
  if (task.status === 'cancelled') return false;
  // 할일(todo)은 캘린더 chip 으로 표시하지 않음 — 별도로 deadline 점만 찍음
  if (task.kind === 'todo') return false;

  const target = dayjs(date).format('YYYY-MM-DD');
  const completions = task.completions ?? [];

  if (task.type === 'one_time') {
    // 완료 기록이 그날에 있으면 표시
    if (completions.some((c) => c.completed_on === target)) return true;
    if (task.status === 'snoozed' && task.snoozed_to) {
      return task.snoozed_to === target;
    }
    if (!task.due_date) return false;
    const start = task.due_date;
    const end = task.end_date ?? task.due_date;
    return target >= start && target <= end;
  }

  // routine — 종료 조건 먼저
  if (task.until_date && target > task.until_date) return false;
  if (task.excluded_dates?.includes(target)) return false;
  if (task.until_count != null && task.recurrence && task.due_date) {
    const eff = computeUntilCountEndDate(task.recurrence, task.due_date, task.until_count);
    if (eff && target > eff) return false;
  }
  // 종료 조건 안에서, 완료 기록이 그날에 있으면 표시
  if (completions.some((c) => c.completed_on === target)) return true;
  // 규칙 매칭일에 표시
  return isRoutineDueOn(task.recurrence, task.due_date, date, completions);
}

/**
 * 캘린더 셀에서 그날의 task가 "완료됨" 상태인지.
 */
export function isTaskCompletedOn(task: Task, date: Dayjs | string): boolean {
  const target = dayjs(date).format('YYYY-MM-DD');
  if (task.type === 'one_time') {
    if (task.status === 'done') return true;
    return (task.completions ?? []).some((c) => c.completed_on === target);
  }
  return (task.completions ?? []).some((c) => c.completed_on === target);
}

/**
 * 한 task가 "지난(미루기 안 한)" 상태인지 판단 — 홈의 "🔴 지난" 섹션용.
 * one_time pending 인데 due_date < 오늘 인 경우.
 */
export function isTaskOverdue(task: Task, today: Dayjs | string): boolean {
  if (task.type !== 'one_time') return false;
  if (task.status !== 'pending') return false;
  if (!task.due_date) return false;
  return dayjs(task.due_date).isBefore(dayjs(today).startOf('day'));
}

/**
 * 루틴 규칙을 사람이 읽을 수 있는 한국어로 변환.
 */
export function describeRecurrence(rule: RecurrenceRule | null): string {
  if (!rule) return '';
  switch (rule.freq) {
    case 'daily':
      return '매일';
    case 'weekly': {
      const labels = ['일', '월', '화', '수', '목', '금', '토'];
      const days = (rule.weekdays ?? []).map((d) => labels[d]).join('·');
      return days ? `매주 ${days}요일` : '매주';
    }
    case 'monthly':
      return rule.lunar ? '매월(음력)' : '매월';
    case 'yearly':
      return rule.lunar ? '매년(음력)' : '매년';
    case 'interval':
      return `${rule.every_days}일마다`;
    case 'count_per_period':
      return `${rule.period === 'week' ? '주' : '월'} ${rule.count}회`;
    default:
      return '';
  }
}
