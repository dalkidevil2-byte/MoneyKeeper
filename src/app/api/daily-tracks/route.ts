export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import type { CreateDailyTrackInput, DailyTrack } from '@/types';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — list with current period count
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const memberId = searchParams.get('member_id');
  const includeInactive = searchParams.get('include_inactive') === '1';

  try {
    let q = supabase
      .from('daily_tracks')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('household_id', householdId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (!includeInactive) q = q.eq('is_active', true);
    if (memberId) {
      q = q.or(
        `member_id.eq.${memberId},target_member_ids.cs.{${memberId}},member_id.is.null`,
      );
    }
    const { data, error } = await q;
    if (error) throw error;

    const tracks = (data ?? []) as unknown as DailyTrack[];
    const trackIds = tracks.map((t) => t.id);
    if (trackIds.length === 0) return NextResponse.json({ tracks: [] });

    // 각 track 의 현재 주기 시작 일자 결정
    const today = dayjs();
    const periodStart = (period: string): string => {
      if (period === 'week') return today.startOf('week').format('YYYY-MM-DD');
      if (period === 'month') return today.startOf('month').format('YYYY-MM-DD');
      return today.format('YYYY-MM-DD');
    };

    // 가장 이른 period 시작일을 lower bound 로 한 번에 fetch
    let earliestStart = today.format('YYYY-MM-DD');
    for (const t of tracks) {
      const ps = periodStart(t.period_unit);
      if (ps < earliestStart) earliestStart = ps;
    }
    const { data: logs } = await supabase
      .from('daily_track_logs')
      .select('track_id, done_on')
      .in('track_id', trackIds)
      .gte('done_on', earliestStart);

    const enriched = tracks.map((t) => {
      const ps = periodStart(t.period_unit);
      const count = (logs ?? []).filter(
        (l) => l.track_id === t.id && (l.done_on as string) >= ps,
      ).length;
      return {
        ...t,
        current_count: count,
        is_done_today: count >= t.target_count,
      };
    });
    return NextResponse.json({ tracks: enriched });
  } catch (e: any) {
    console.error('[GET /daily-tracks]', e);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

// POST — create
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body: CreateDailyTrackInput = await req.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 });
    }
    const targetIds = Array.isArray(body.target_member_ids)
      ? body.target_member_ids.filter(Boolean)
      : [];
    const insert = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      title: body.title.trim(),
      emoji: body.emoji ?? '✅',
      category_main: body.category_main ?? '',
      member_id: body.member_id ?? null,
      target_member_ids: targetIds,
      target_count: Math.max(1, body.target_count ?? 1),
      period_unit: body.period_unit ?? 'day',
      start_date: body.start_date ?? null,
      end_date: body.end_date ?? null,
      is_active: true,
    };
    const { data, error } = await supabase
      .from('daily_tracks')
      .insert(insert)
      .select(`*, member:members!member_id(id, name, color)`)
      .single();
    if (error) throw error;
    return NextResponse.json({ track: data }, { status: 201 });
  } catch (e: any) {
    console.error('[POST /daily-tracks]', e);
    return NextResponse.json({ error: e?.message ?? '저장 실패' }, { status: 500 });
  }
}
