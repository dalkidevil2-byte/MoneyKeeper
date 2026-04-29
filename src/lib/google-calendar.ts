/**
 * Google Calendar API 헬퍼.
 * - googleapis 패키지 미사용 (의존성 최소화) — 직접 fetch.
 * - household 별 refresh_token 으로 access_token 갱신 후 호출.
 * - Task 1건 ↔ Google Event 1건 매핑 (tasks.google_event_id).
 */

import { createServerSupabaseClient } from './supabase';
import type { Task } from '@/types';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_API_BASE = 'https://www.googleapis.com/calendar/v3';

export type GCalSync = {
  household_id: string;
  google_email: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  calendar_id: string;
  is_active: boolean;
  last_synced_at: string | null;
};

export const GCAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid',
];

export function buildAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GCAL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // refresh_token 보장
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  id_token?: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI!;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`token exchange 실패: ${res.status} ${t}`);
  }
  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`refresh 실패: ${res.status} ${t}`);
  }
  return res.json();
}

/** household 의 access_token 확보 (만료 5분 전이면 refresh) */
export async function getAccessToken(householdId: string): Promise<{
  accessToken: string;
  sync: GCalSync;
} | null> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('google_calendar_sync')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();
  if (error || !data || !data.is_active) return null;

  const sync = data as GCalSync;
  const now = Date.now();
  const expiresAt = sync.access_token_expires_at
    ? new Date(sync.access_token_expires_at).getTime()
    : 0;

  if (sync.access_token && expiresAt - now > 5 * 60 * 1000) {
    return { accessToken: sync.access_token, sync };
  }

  const { access_token, expires_in } = await refreshAccessToken(sync.refresh_token);
  const newExp = new Date(now + expires_in * 1000).toISOString();
  await supabase
    .from('google_calendar_sync')
    .update({
      access_token,
      access_token_expires_at: newExp,
      updated_at: new Date().toISOString(),
    })
    .eq('household_id', householdId);
  return { accessToken: access_token, sync: { ...sync, access_token, access_token_expires_at: newExp } };
}

// ─────────────────────────────────────────
// 멤버 hex 색 → Google Event colorId 매핑
// Google 캘린더 이벤트 색은 1~11 고정 팔레트
// ─────────────────────────────────────────
const GCAL_PALETTE: { id: string; hex: string }[] = [
  { id: '1', hex: '#7986cb' },  // Lavender
  { id: '2', hex: '#33b679' },  // Sage
  { id: '3', hex: '#8e24aa' },  // Grape
  { id: '4', hex: '#e67c73' },  // Flamingo
  { id: '5', hex: '#f6c026' },  // Banana
  { id: '6', hex: '#f5511d' },  // Tangerine
  { id: '7', hex: '#039be5' },  // Peacock
  { id: '8', hex: '#616161' },  // Graphite
  { id: '9', hex: '#3f51b5' },  // Blueberry
  { id: '10', hex: '#0b8043' }, // Basil
  { id: '11', hex: '#d60000' }, // Tomato
];

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return (
    (a[0] - b[0]) ** 2 +
    (a[1] - b[1]) ** 2 +
    (a[2] - b[2]) ** 2
  );
}

function pickColorId(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  let best: { id: string; dist: number } | null = null;
  for (const p of GCAL_PALETTE) {
    const prgb = hexToRgb(p.hex)!;
    const d = colorDistance(rgb, prgb);
    if (!best || d < best.dist) best = { id: p.id, dist: d };
  }
  return best?.id ?? null;
}

// ─────────────────────────────────────────
// Task → Google Event payload 변환
// ─────────────────────────────────────────
export function taskToEvent(task: Task): Record<string, unknown> | null {
  // todo 는 동기화 대상 아님 (시간 지정된 일정만)
  if (task.kind === 'todo') return null;
  if (!task.due_date) return null;

  const isAllDay = !task.is_fixed || !task.due_time;
  const startDate = task.due_date;
  const endDate = task.end_date ?? task.due_date;

  let start: Record<string, string>;
  let end: Record<string, string>;
  if (isAllDay) {
    start = { date: startDate };
    // 구글은 종일 이벤트의 end.date 가 exclusive 라 +1일
    const endDay = new Date(endDate);
    endDay.setDate(endDay.getDate() + 1);
    end = { date: endDay.toISOString().slice(0, 10) };
  } else {
    const s = `${startDate}T${task.due_time}`;
    const eTime = task.end_time ?? task.due_time;
    const e = `${endDate}T${eTime}`;
    start = { dateTime: s, timeZone: 'Asia/Seoul' };
    end = { dateTime: e, timeZone: 'Asia/Seoul' };
  }

  const event: Record<string, unknown> = {
    summary: task.title,
    description: task.memo || undefined,
    start,
    end,
  };

  // 멤버 색상 → Google colorId
  const memberColor = task.member?.color ?? null;
  const colorId = pickColorId(memberColor);
  if (colorId) event.colorId = colorId;

  // 루틴 → RRULE
  if (task.type === 'routine' && task.recurrence) {
    const rrule = recurrenceToRRule(task.recurrence, task.until_date);
    if (rrule) event.recurrence = [rrule];
  }
  return event;
}

function recurrenceToRRule(
  recurrence: NonNullable<Task['recurrence']>,
  untilDate: string | null,
): string | null {
  if (!recurrence) return null;
  const parts: string[] = [];
  switch (recurrence.freq) {
    case 'daily':
      parts.push('FREQ=DAILY');
      break;
    case 'weekly':
      parts.push('FREQ=WEEKLY');
      if (recurrence.weekdays && recurrence.weekdays.length > 0) {
        const wd = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
        parts.push('BYDAY=' + recurrence.weekdays.map((d) => wd[d]).join(','));
      }
      break;
    case 'monthly':
      parts.push('FREQ=MONTHLY');
      break;
    case 'yearly':
      parts.push('FREQ=YEARLY');
      break;
    default:
      return null;
  }
  // interval은 일부 freq에 한해 — 안전하게 any로 접근
  const interval = (recurrence as { interval?: number }).interval;
  if (interval && interval > 1) {
    parts.push(`INTERVAL=${interval}`);
  }
  if (untilDate) {
    parts.push(`UNTIL=${untilDate.replace(/-/g, '')}T235959Z`);
  }
  return 'RRULE:' + parts.join(';');
}

// ─────────────────────────────────────────
// CRUD
// ─────────────────────────────────────────
export async function pushTaskToGoogle(
  householdId: string,
  task: Task,
): Promise<string | null> {
  const ev = taskToEvent(task);
  if (!ev) return null;
  const auth = await getAccessToken(householdId);
  if (!auth) return null;

  // 기존 매핑 있으면 그 캘린더에, 없으면 primary
  const targetCalRaw =
    task.google_calendar_id || auth.sync.calendar_id || 'primary';
  const calId = encodeURIComponent(targetCalRaw);
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json',
  };

  if (task.google_event_id) {
    // 업데이트
    const res = await fetch(
      `${CAL_API_BASE}/calendars/${calId}/events/${encodeURIComponent(task.google_event_id)}`,
      { method: 'PUT', headers, body: JSON.stringify(ev) },
    );
    if (res.ok) return task.google_event_id;
    if (res.status === 404 || res.status === 410) {
      // 삭제됐으면 새로 생성 (primary 로 fallback)
      return await createEvent(
        encodeURIComponent(auth.sync.calendar_id || 'primary'),
        headers,
        ev,
      );
    }
    const t = await res.text();
    console.warn('[gcal] update fail', res.status, t);
    return task.google_event_id;
  }

  // 신규 생성
  return await createEvent(calId, headers, ev);
}

async function createEvent(
  calId: string,
  headers: Record<string, string>,
  ev: Record<string, unknown>,
): Promise<string | null> {
  const res = await fetch(`${CAL_API_BASE}/calendars/${calId}/events`, {
    method: 'POST',
    headers,
    body: JSON.stringify(ev),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn('[gcal] create fail', res.status, t);
    return null;
  }
  const j = await res.json();
  return j.id ?? null;
}

// ─────────────────────────────────────────
// 가져오기 (Google → 우리)
// ─────────────────────────────────────────
type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurringEventId?: string;
  updated?: string;
};

/** 모든 사용자 캘린더 목록 — primary 외에 보조/공유 캘린더 모두 */
async function listCalendars(
  accessToken: string,
): Promise<{ id: string; summary: string; primary?: boolean; selected?: boolean }[]> {
  const res = await fetch(`${CAL_API_BASE}/users/me/calendarList?minAccessRole=reader`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return [];
  const j = await res.json();
  return j.items ?? [];
}

type GEventWithCal = GEvent & { _calendarId: string };

/**
 * 모든 캘린더의 이벤트를 시간 범위 내에서 페치.
 * primary + 보조/공유 캘린더 전부.
 * 기본 5년 전 ~ 5년 후, 캘린더당 페이지네이션.
 */
export async function fetchEventsFromGoogle(
  householdId: string,
): Promise<{ events: GEventWithCal[]; sync: GCalSync } | null> {
  const auth = await getAccessToken(householdId);
  if (!auth) return null;

  const calendars = await listCalendars(auth.accessToken);
  if (calendars.length === 0) return null;

  const now = new Date();
  const min = new Date(now);
  min.setFullYear(now.getFullYear() - 5);
  const max = new Date(now);
  max.setFullYear(now.getFullYear() + 5);

  const all: GEventWithCal[] = [];

  for (const cal of calendars) {
    const calId = encodeURIComponent(cal.id);
    let pageToken: string | undefined;
    let pages = 0;
    const MAX_PAGES = 20;

    do {
      const params = new URLSearchParams({
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '250',
        orderBy: 'startTime',
        timeMin: min.toISOString(),
        timeMax: max.toISOString(),
      });
      if (pageToken) params.set('pageToken', pageToken);

      const res = await fetch(`${CAL_API_BASE}/calendars/${calId}/events?${params}`, {
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });
      if (!res.ok) {
        console.warn('[gcal] fetch fail', cal.summary, res.status);
        break;
      }
      const j = await res.json();
      const items = (j.items ?? []) as GEvent[];
      for (const it of items) all.push({ ...it, _calendarId: cal.id });
      pageToken = j.nextPageToken;
      pages++;
      if (pages >= MAX_PAGES) {
        console.warn('[gcal] page 한도 도달', cal.summary, all.length);
        break;
      }
    } while (pageToken);
  }

  return { events: all, sync: auth.sync };
}

/**
 * 구글 이벤트 → Task insert/update 적용.
 * 우리 앱에서 push 한 이벤트는 google_event_id 로 매칭되어 중복 생성 안 됨.
 */
export async function pullEventsToTasks(householdId: string): Promise<{
  created: number;
  updated: number;
  deleted: number;
}> {
  const result = { created: 0, updated: 0, deleted: 0 };
  const data = await fetchEventsFromGoogle(householdId);
  if (!data) return result;

  const supabase = createServerSupabaseClient();

  // 우리 앱의 google_event_id → task 매핑
  const { data: existing } = await supabase
    .from('tasks')
    .select('id, google_event_id, updated_at')
    .eq('household_id', householdId)
    .not('google_event_id', 'is', null);
  const byGid = new Map<string, { id: string; updated_at: string }>();
  for (const t of existing ?? []) {
    if (t.google_event_id)
      byGid.set(t.google_event_id as string, { id: t.id as string, updated_at: t.updated_at as string });
  }

  for (const ev of data.events) {
    if (!ev.id) continue;
    const matched = byGid.get(ev.id) ?? null;

    // 삭제 처리
    if (ev.status === 'cancelled') {
      if (matched) {
        await supabase
          .from('tasks')
          .update({ status: 'cancelled', is_active: false })
          .eq('id', matched.id);
        result.deleted++;
      }
      continue;
    }

    // recurring 인스턴스는 부모 1건만 매칭하면 되므로 instance 는 스킵
    if (ev.recurringEventId && ev.recurringEventId !== ev.id) continue;

    const fields = eventToTaskFields(ev);
    if (!fields) continue;

    const calId = (ev as GEventWithCal)._calendarId ?? null;

    if (matched) {
      // 우리 쪽이 더 최근이면 덮어쓰지 않음
      const ourUpdated = new Date(matched.updated_at).getTime();
      const theirUpdated = ev.updated ? new Date(ev.updated).getTime() : 0;
      if (theirUpdated <= ourUpdated) continue;
      await supabase
        .from('tasks')
        .update({ ...fields, google_calendar_id: calId })
        .eq('id', matched.id);
      result.updated++;
    } else {
      await supabase.from('tasks').insert({
        household_id: householdId,
        kind: 'event',
        google_event_id: ev.id,
        google_calendar_id: calId,
        google_synced_at: new Date().toISOString(),
        ...fields,
      });
      result.created++;
    }
  }

  await supabase
    .from('google_calendar_sync')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('household_id', householdId);

  return result;
}

function eventToTaskFields(ev: GEvent): Record<string, unknown> | null {
  if (!ev.start || !ev.summary) return null;
  const isAllDay = !!ev.start.date;
  let due_date: string;
  let due_time: string | null = null;
  let end_date: string;
  let end_time: string | null = null;

  if (isAllDay) {
    due_date = ev.start.date!;
    // 구글 종일 end.date 는 exclusive → -1일
    if (ev.end?.date) {
      const d = new Date(ev.end.date);
      d.setDate(d.getDate() - 1);
      end_date = d.toISOString().slice(0, 10);
    } else {
      end_date = due_date;
    }
  } else {
    const sd = ev.start.dateTime!;
    due_date = sd.slice(0, 10);
    due_time = sd.slice(11, 19);
    const ed = ev.end?.dateTime ?? sd;
    end_date = ed.slice(0, 10);
    end_time = ed.slice(11, 19);
  }

  return {
    title: ev.summary,
    memo: ev.description ?? '',
    type: 'one_time',
    is_fixed: !isAllDay,
    due_date,
    end_date,
    due_time,
    end_time,
    status: 'pending',
    is_active: true,
    google_synced_at: new Date().toISOString(),
  };
}

export async function deleteTaskFromGoogle(
  householdId: string,
  googleEventId: string,
  calendarIdHint?: string | null,
): Promise<boolean> {
  const auth = await getAccessToken(householdId);
  if (!auth) return false;
  const calRaw = calendarIdHint || auth.sync.calendar_id || 'primary';
  const calId = encodeURIComponent(calRaw);
  const res = await fetch(
    `${CAL_API_BASE}/calendars/${calId}/events/${encodeURIComponent(googleEventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    },
  );
  if (res.ok || res.status === 404 || res.status === 410) return true;
  // hint 가 틀렸을 수 있으니 primary 로 한 번 더 시도
  if (calendarIdHint && calendarIdHint !== 'primary') {
    const res2 = await fetch(
      `${CAL_API_BASE}/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      },
    );
    return res2.ok || res2.status === 404 || res2.status === 410;
  }
  return false;
}
