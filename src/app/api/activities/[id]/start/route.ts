export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

/**
 * POST /api/activities/[id]/start
 * - 진행 중 세션이 있으면 그것을 반환 (이미 시작됨)
 * - 없으면 새 session 생성 (start_at=now)
 * - daily_track_id 있으면 오늘 daily_track_logs 자동 추가 (없을 때만)
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: act } = await supabase
      .from('activities')
      .select('id, household_id, member_id, daily_track_id')
      .eq('id', id)
      .maybeSingle();
    if (!act) {
      return NextResponse.json({ error: '활동 없음' }, { status: 404 });
    }

    // 이미 진행중이면 그대로 반환
    const { data: running } = await supabase
      .from('activity_sessions')
      .select('*')
      .eq('activity_id', id)
      .is('end_at', null)
      .maybeSingle();
    if (running) {
      return NextResponse.json({ session: running, started: false });
    }

    const todayKey = dayjs().tz(TZ).format('YYYY-MM-DD');

    // Daily Track 자동 체크
    // - condition_text 있으면 시작 시점엔 체크 X (정지 시 AI 평가)
    // - 없으면 기존 동작 (시작 즉시 체크)
    let dailyTrackLogId: string | null = null;
    if (act.daily_track_id) {
      const { data: track } = await supabase
        .from('daily_tracks')
        .select('condition_text')
        .eq('id', act.daily_track_id)
        .maybeSingle();
      const hasCondition =
        track?.condition_text && String(track.condition_text).trim().length > 0;

      if (!hasCondition) {
        // 기존 동작 — 시작 시 체크
        const { data: existingLog } = await supabase
          .from('daily_track_logs')
          .select('id')
          .eq('track_id', act.daily_track_id)
          .eq('done_on', todayKey)
          .limit(1)
          .maybeSingle();
        if (existingLog) {
          dailyTrackLogId = existingLog.id as string;
        } else {
          const { data: log } = await supabase
            .from('daily_track_logs')
            .insert({
              track_id: act.daily_track_id,
              household_id: act.household_id,
              done_on: todayKey,
              member_id: act.member_id,
            })
            .select('id')
            .single();
          if (log) dailyTrackLogId = log.id as string;
        }
      }
      // condition_text 있으면 정지 시 평가에서 처리
    }

    // 세션 생성
    const { data: session, error } = await supabase
      .from('activity_sessions')
      .insert({
        household_id: act.household_id,
        activity_id: id,
        member_id: act.member_id,
        session_date: todayKey,
        daily_track_log_id: dailyTrackLogId,
      })
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ session, started: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
