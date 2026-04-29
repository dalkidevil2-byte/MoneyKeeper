export const dynamic = 'force-dynamic';
import { NextResponse, NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { deleteTaskFromGoogle } from '@/lib/google-calendar';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type Row = {
  id: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
  end_date: string | null;
  end_time: string | null;
  is_fixed: boolean | null;
  google_event_id: string | null;
  status: string;
  created_at: string;
  member_id: string | null;
};

/**
 * GET: 중복 후보 미리보기 (그룹별)
 * POST: 실제 정리 실행 (각 그룹에서 1개만 남기고 나머지 cancel + 구글에서 삭제)
 *   body: { groupKeys?: string[] }  — 정리할 그룹 키 목록 (생략 시 전체)
 */

function makeKey(r: Row): string {
  // 같은 일정이라고 보는 기준: 제목 + 시작일 + 종료일 + 시작시간
  return [
    r.title.trim().toLowerCase(),
    r.due_date ?? '',
    r.end_date ?? r.due_date ?? '',
    r.is_fixed ? r.due_time?.slice(0, 5) ?? '' : 'allday',
  ].join('|');
}

async function findGroups() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('tasks')
    .select(
      'id, title, due_date, due_time, end_date, end_time, is_fixed, google_event_id, status, created_at, member_id',
    )
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('is_active', true)
    .neq('status', 'cancelled')
    .not('due_date', 'is', null);

  const map = new Map<string, Row[]>();
  for (const r of (data ?? []) as Row[]) {
    if (!r.title || !r.due_date) continue;
    const k = makeKey(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  // 2개 이상만
  const groups: { key: string; items: Row[] }[] = [];
  for (const [key, items] of map) {
    if (items.length >= 2) groups.push({ key, items });
  }
  return groups;
}

function pickKeeper(items: Row[]): Row {
  // 우선순위: google_event_id 있는 거 > member_id 있는 거 > 가장 오래된 (created_at 빠른)
  const sorted = [...items].sort((a, b) => {
    if ((a.google_event_id ? 1 : 0) !== (b.google_event_id ? 1 : 0)) {
      return (b.google_event_id ? 1 : 0) - (a.google_event_id ? 1 : 0);
    }
    if ((a.member_id ? 1 : 0) !== (b.member_id ? 1 : 0)) {
      return (b.member_id ? 1 : 0) - (a.member_id ? 1 : 0);
    }
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  });
  return sorted[0];
}

export async function GET() {
  const groups = await findGroups();
  return NextResponse.json({
    total_groups: groups.length,
    total_duplicates: groups.reduce((s, g) => s + g.items.length - 1, 0),
    groups: groups.map((g) => ({
      key: g.key,
      keeper_id: pickKeeper(g.items).id,
      items: g.items.map((i) => ({
        id: i.id,
        title: i.title,
        date: i.due_date,
        time: i.due_time,
        member_id: i.member_id,
        google_event_id: i.google_event_id,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const groupKeysFilter: string[] | undefined = body?.groupKeys;

  const supabase = createServerSupabaseClient();
  const groups = await findGroups();
  const targetGroups = groupKeysFilter
    ? groups.filter((g) => groupKeysFilter.includes(g.key))
    : groups;

  let removed = 0;
  let googleDeleted = 0;
  for (const g of targetGroups) {
    const keeper = pickKeeper(g.items);
    const losers = g.items.filter((r) => r.id !== keeper.id);
    for (const loser of losers) {
      // 구글에서 삭제 (loser 가 google_event_id 가지고 있고, keeper 와 다르면)
      if (loser.google_event_id && loser.google_event_id !== keeper.google_event_id) {
        try {
          await deleteTaskFromGoogle(HOUSEHOLD_ID, loser.google_event_id);
          googleDeleted++;
        } catch {
          /* skip */
        }
      }
      // task 비활성화
      await supabase
        .from('tasks')
        .update({ status: 'cancelled', is_active: false })
        .eq('id', loser.id);
      removed++;
    }
  }

  return NextResponse.json({
    success: true,
    groups_processed: targetGroups.length,
    removed,
    google_deleted: googleDeleted,
  });
}
