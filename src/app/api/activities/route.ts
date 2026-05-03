export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 활동 목록 + 진행중 세션 + 오늘/주 합계
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId =
    searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    const { data: activities, error } = await supabase
      .from('activities')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    if (!activities || activities.length === 0) {
      return NextResponse.json({ activities: [] });
    }

    const activityIds = activities.map((a) => a.id as string);

    // 진행중 세션
    const { data: running } = await supabase
      .from('activity_sessions')
      .select('*')
      .in('activity_id', activityIds)
      .is('end_at', null);
    const runningMap = new Map<string, unknown>();
    for (const s of running ?? []) {
      runningMap.set(s.activity_id as string, s);
    }

    // 오늘/이번주 합계
    const todayKey = dayjs().tz(TZ).format('YYYY-MM-DD');
    const weekStartKey = dayjs().tz(TZ).startOf('week').format('YYYY-MM-DD');
    const recent30Key = dayjs().tz(TZ).subtract(30, 'day').format('YYYY-MM-DD');
    // 정렬용 — 최근 30일 세션 카운트도 함께 집계
    const { data: recentSessions } = await supabase
      .from('activity_sessions')
      .select('activity_id, session_date, duration_minutes')
      .in('activity_id', activityIds)
      .gte('session_date', recent30Key);
    const todayMin = new Map<string, number>();
    const weekMin = new Map<string, number>();
    const recentCount = new Map<string, number>();
    for (const s of recentSessions ?? []) {
      const aid = s.activity_id as string;
      recentCount.set(aid, (recentCount.get(aid) ?? 0) + 1);
      const d = (s.duration_minutes as number) ?? 0;
      const sd = s.session_date as string;
      if (sd >= weekStartKey) {
        weekMin.set(aid, (weekMin.get(aid) ?? 0) + d);
        if (sd === todayKey) {
          todayMin.set(aid, (todayMin.get(aid) ?? 0) + d);
        }
      }
    }

    const enriched = activities.map((a) => ({
      ...a,
      running_session: runningMap.get(a.id as string) ?? null,
      today_minutes: todayMin.get(a.id as string) ?? 0,
      week_minutes: weekMin.get(a.id as string) ?? 0,
      recent_count: recentCount.get(a.id as string) ?? 0,
    }));

    return NextResponse.json({ activities: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

// POST — 새 활동
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: 'name 필요' }, { status: 400 });
    }
    const insert = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      name: body.name.trim(),
      emoji: body.emoji ?? '⏱',
      color: body.color ?? '#6366f1',
      category: body.category ?? '',
      member_id: body.member_id ?? null,
      is_favorite: body.is_favorite ?? true,
      is_active: true,
      goal_id: body.goal_id ?? null,
      daily_track_id: body.daily_track_id ?? null,
      goal_count_mode: body.goal_count_mode ?? 'session',
    };
    const { data, error } = await supabase
      .from('activities')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
