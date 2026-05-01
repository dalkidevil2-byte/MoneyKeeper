/**
 * AI 어시스턴트가 사용할 도구(function call) 정의 + 실행기.
 * OpenAI tool_calls 응답이 오면 여기서 실행하고 결과를 다시 LLM 에 전달.
 */

import { createServerSupabaseClient } from './supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_tasks',
      description:
        '제목/메모/카테고리/날짜로 할일·일정 검색. 결과는 최대 20건. 시간 정보 포함.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '제목/메모 검색 키워드 (선택)' },
          kind: {
            type: 'string',
            enum: ['event', 'todo'],
            description: '일정(event) 또는 할일(todo) 필터 (선택)',
          },
          status: {
            type: 'string',
            enum: ['pending', 'done', 'all'],
            description: '상태 필터 (기본: pending)',
          },
          date_from: { type: 'string', description: 'YYYY-MM-DD 시작일' },
          date_to: { type: 'string', description: 'YYYY-MM-DD 종료일' },
          limit: { type: 'integer', description: '최대 갯수 (기본 20)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_today_summary',
      description: '오늘의 일정 + 할일 + Daily Track 요약. 기본 필수 도구.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_week_stats',
      description:
        '주간 통계 — 완료한 일정 갯수, 카테고리별 시간 합계, 미완료 등.',
      parameters: {
        type: 'object',
        properties: {
          week_offset: {
            type: 'integer',
            description: '0=이번 주, -1=지난 주, 1=다음 주',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_free_slots',
      description: '특정 날짜에 비어있는 시간대 (1시간 이상) 찾기.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          start_hour: { type: 'integer', description: '검색 시작 시 (기본 9)' },
          end_hour: { type: 'integer', description: '검색 종료 시 (기본 22)' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_goal_progress',
      description: '목표(goal) 들의 진행률, 연결된 할일 수, 누적 시간.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_task',
      description:
        '새 일정/할일 생성. 사용자가 명시적으로 만들어달라고 할 때만 호출. 시간 일정이면 due_time 도 지정.',
      parameters: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['event', 'todo'] },
          title: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD (event)' },
          due_time: { type: 'string', description: 'HH:MM (선택)' },
          end_time: { type: 'string', description: 'HH:MM (선택)' },
          deadline_date: {
            type: 'string',
            description: 'YYYY-MM-DD (todo 마감일)',
          },
          memo: { type: 'string' },
        },
        required: ['kind', 'title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_time_breakdown',
      description:
        '특정 기간의 카테고리별/멤버별 시간 누적 — 어디에 시간 많이 썼는지.',
      parameters: {
        type: 'object',
        properties: {
          date_from: { type: 'string', description: 'YYYY-MM-DD' },
          date_to: { type: 'string', description: 'YYYY-MM-DD' },
          group_by: {
            type: 'string',
            enum: ['category', 'member', 'task'],
            description: '집계 기준',
          },
        },
        required: ['date_from', 'date_to'],
      },
    },
  },
];

// ─────────────────────────────────────────
// 실행기
// ─────────────────────────────────────────

type ToolResult = { ok: boolean; data?: unknown; error?: string };

export async function executeTool(
  householdId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const supabase = createServerSupabaseClient();

  try {
    switch (name) {
      case 'search_tasks': {
        let q = supabase
          .from('tasks')
          .select('id, title, memo, kind, type, due_date, due_time, deadline_date, deadline_time, status, category_main, category_sub')
          .eq('household_id', householdId)
          .eq('is_active', true);

        if (args.kind) q = q.eq('kind', args.kind as string);
        const status = (args.status as string) ?? 'pending';
        if (status !== 'all') q = q.eq('status', status);
        if (args.date_from) q = q.gte('due_date', args.date_from as string);
        if (args.date_to) q = q.lte('due_date', args.date_to as string);
        const limit = (args.limit as number) ?? 20;
        q = q.limit(limit).order('due_date', { ascending: true, nullsFirst: false });

        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };

        let filtered = data ?? [];
        if (args.query) {
          const needle = (args.query as string).toLowerCase();
          filtered = filtered.filter((t) =>
            [t.title, t.memo, t.category_main, t.category_sub]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle),
          );
        }
        return { ok: true, data: { count: filtered.length, tasks: filtered } };
      }

      case 'get_today_summary': {
        const today = dayjs().tz(TZ).format('YYYY-MM-DD');
        const { data: events } = await supabase
          .from('tasks')
          .select('id, title, due_time, end_time, status, category_main')
          .eq('household_id', householdId)
          .eq('kind', 'event')
          .eq('is_active', true)
          .neq('status', 'cancelled')
          .eq('due_date', today)
          .order('due_time', { ascending: true });

        const { data: todos } = await supabase
          .from('tasks')
          .select('id, title, deadline_date, status, priority')
          .eq('household_id', householdId)
          .eq('kind', 'todo')
          .eq('is_active', true)
          .neq('status', 'cancelled');

        const { data: tracks } = await supabase
          .from('daily_tracks')
          .select('id, title, period')
          .eq('household_id', householdId)
          .eq('is_active', true);

        return {
          ok: true,
          data: {
            today,
            events: events ?? [],
            todos: todos ?? [],
            daily_tracks: tracks ?? [],
          },
        };
      }

      case 'get_week_stats': {
        const offset = (args.week_offset as number) ?? 0;
        const start = dayjs().tz(TZ).startOf('week').add(offset, 'week');
        const end = start.add(6, 'day');
        const startStr = start.format('YYYY-MM-DD');
        const endStr = end.format('YYYY-MM-DD');

        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, kind, status, due_date, due_time, end_time, category_main')
          .eq('household_id', householdId)
          .eq('is_active', true)
          .gte('due_date', startStr)
          .lte('due_date', endStr);

        const events = (tasks ?? []).filter((t) => t.kind === 'event');
        const completed = events.filter((t) => t.status === 'done').length;

        return {
          ok: true,
          data: {
            week: `${startStr} ~ ${endStr}`,
            total_events: events.length,
            completed,
            completion_rate:
              events.length > 0
                ? `${Math.round((completed / events.length) * 100)}%`
                : '-',
            tasks: events.slice(0, 50),
          },
        };
      }

      case 'get_free_slots': {
        const date = args.date as string;
        const startHour = (args.start_hour as number) ?? 9;
        const endHour = (args.end_hour as number) ?? 22;

        const { data: tasks } = await supabase
          .from('tasks')
          .select('title, due_time, end_time, is_fixed')
          .eq('household_id', householdId)
          .eq('kind', 'event')
          .eq('is_active', true)
          .neq('status', 'cancelled')
          .eq('due_date', date)
          .eq('is_fixed', true);

        // 분 단위로 occupied 표기
        const occupied: { start: number; end: number; title: string }[] = [];
        for (const t of tasks ?? []) {
          if (!t.due_time) continue;
          const [sh, sm] = (t.due_time as string).slice(0, 5).split(':').map(Number);
          const startMin = sh * 60 + sm;
          let endMin = startMin + 60;
          if (t.end_time) {
            const [eh, em] = (t.end_time as string).slice(0, 5).split(':').map(Number);
            endMin = eh * 60 + em;
          }
          occupied.push({ start: startMin, end: endMin, title: t.title as string });
        }
        occupied.sort((a, b) => a.start - b.start);

        const slots: { start: string; end: string; minutes: number }[] = [];
        let cursor = startHour * 60;
        const limit = endHour * 60;
        for (const o of occupied) {
          if (o.start > cursor && o.start <= limit) {
            slots.push({
              start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
              end: `${String(Math.floor(o.start / 60)).padStart(2, '0')}:${String(o.start % 60).padStart(2, '0')}`,
              minutes: o.start - cursor,
            });
          }
          cursor = Math.max(cursor, o.end);
        }
        if (cursor < limit) {
          slots.push({
            start: `${String(Math.floor(cursor / 60)).padStart(2, '0')}:${String(cursor % 60).padStart(2, '0')}`,
            end: `${String(Math.floor(limit / 60)).padStart(2, '0')}:${String(limit % 60).padStart(2, '0')}`,
            minutes: limit - cursor,
          });
        }
        return {
          ok: true,
          data: {
            date,
            occupied,
            free_slots: slots.filter((s) => s.minutes >= 30),
          },
        };
      }

      case 'get_goal_progress': {
        const { data: goals } = await supabase
          .from('goals')
          .select('id, title, target_value, current_value, deadline, status')
          .eq('household_id', householdId)
          .eq('is_active', true);
        return { ok: true, data: { goals: goals ?? [] } };
      }

      case 'create_task': {
        const insert: Record<string, unknown> = {
          household_id: householdId,
          kind: args.kind as string,
          type: 'one_time',
          title: args.title as string,
          memo: (args.memo as string) ?? '',
          status: 'pending',
          is_active: true,
          priority: 'normal',
        };
        if (args.kind === 'event') {
          if (!args.due_date)
            return { ok: false, error: 'due_date 필요 (event)' };
          insert.due_date = args.due_date;
          if (args.due_time) {
            insert.is_fixed = true;
            insert.due_time = `${(args.due_time as string).slice(0, 5)}:00`;
            if (args.end_time) {
              insert.end_time = `${(args.end_time as string).slice(0, 5)}:00`;
            }
          }
        } else {
          if (args.deadline_date) insert.deadline_date = args.deadline_date;
        }
        const { data, error } = await supabase
          .from('tasks')
          .insert(insert)
          .select('*')
          .single();
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { task: data, message: `${args.title} 생성됨` } };
      }

      case 'get_time_breakdown': {
        const from = args.date_from as string;
        const to = args.date_to as string;
        const groupBy = (args.group_by as string) ?? 'category';

        const { data: sessions } = await supabase
          .from('task_work_sessions')
          .select('task_id, session_date, start_time, end_time')
          .eq('household_id', householdId)
          .gte('session_date', from)
          .lte('session_date', to);

        const taskIds = Array.from(
          new Set((sessions ?? []).map((s) => s.task_id as string)),
        );
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, category_main, member_id')
          .in('id', taskIds.length > 0 ? taskIds : ['00000000-0000-0000-0000-000000000000']);
        const taskMap = new Map<string, { title: string; category_main: string | null; member_id: string | null }>();
        for (const t of tasks ?? []) {
          taskMap.set(t.id as string, {
            title: t.title as string,
            category_main: t.category_main as string | null,
            member_id: t.member_id as string | null,
          });
        }

        const buckets = new Map<string, number>();
        for (const s of sessions ?? []) {
          if (!s.start_time || !s.end_time) continue;
          const [sh, sm] = (s.start_time as string).split(':').map(Number);
          const [eh, em] = (s.end_time as string).split(':').map(Number);
          const min = eh * 60 + em - (sh * 60 + sm);
          if (min <= 0) continue;
          const t = taskMap.get(s.task_id as string);
          if (!t) continue;
          let key = '미분류';
          if (groupBy === 'category') key = t.category_main || '미분류';
          else if (groupBy === 'task') key = t.title;
          else if (groupBy === 'member') key = t.member_id || '공유';
          buckets.set(key, (buckets.get(key) ?? 0) + min);
        }
        const result = Array.from(buckets.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([key, minutes]) => ({
            key,
            minutes,
            label:
              minutes >= 60
                ? `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`
                : `${minutes}분`,
          }));
        return {
          ok: true,
          data: { range: `${from} ~ ${to}`, group_by: groupBy, breakdown: result },
        };
      }

      default:
        return { ok: false, error: `알 수 없는 도구: ${name}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
