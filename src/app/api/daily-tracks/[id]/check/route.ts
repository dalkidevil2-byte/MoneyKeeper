export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// POST — 1회 체크 (오늘 날짜로 로그 1줄 추가)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json().catch(() => ({}));
    const doneOn: string = body.done_on ?? dayjs().format('YYYY-MM-DD');
    const memberId: string | null = body.member_id ?? null;

    const { data: track } = await supabase
      .from('daily_tracks')
      .select('household_id, member_id, goal_id')
      .eq('id', id)
      .maybeSingle();
    if (!track) {
      return NextResponse.json({ error: '트랙을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: log, error } = await supabase
      .from('daily_track_logs')
      .insert({
        track_id: id,
        household_id: track.household_id ?? DEFAULT_HOUSEHOLD_ID,
        done_on: doneOn,
        member_id: memberId ?? track.member_id ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;

    // 목표 연결돼있으면 자동 +1 (UNIQUE 제약 으로 중복 방지)
    if (track.goal_id) {
      try {
        await supabase.from('goal_progress_events').insert({
          goal_id: track.goal_id,
          household_id: track.household_id ?? DEFAULT_HOUSEHOLD_ID,
          occurred_on: doneOn,
          delta: 1,
          source: 'daily_track_check',
          daily_track_log_id: log.id,
        });
      } catch (e) {
        console.warn('[track check] goal progress insert 실패', e);
      }
    }

    return NextResponse.json({ log });
  } catch (e: any) {
    console.error('[POST track check]', e);
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// DELETE — 가장 최근 1회 체크 취소 (현재 주기 내)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: track } = await supabase
      .from('daily_tracks')
      .select('period_unit')
      .eq('id', id)
      .maybeSingle();
    if (!track) {
      return NextResponse.json({ error: '트랙 없음' }, { status: 404 });
    }
    const today = dayjs();
    const periodStart =
      track.period_unit === 'week'
        ? today.startOf('week').format('YYYY-MM-DD')
        : track.period_unit === 'month'
          ? today.startOf('month').format('YYYY-MM-DD')
          : today.format('YYYY-MM-DD');
    const { data: latest } = await supabase
      .from('daily_track_logs')
      .select('id')
      .eq('track_id', id)
      .gte('done_on', periodStart)
      .order('done_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      await supabase.from('daily_track_logs').delete().eq('id', latest.id);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
