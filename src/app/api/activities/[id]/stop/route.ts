export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { evaluateCondition } from '@/lib/daily-track-condition';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

/**
 * POST /api/activities/[id]/stop
 * - 진행 중 세션 종료. 자정을 넘긴 경우 KST 자정 단위로 자동 분할.
 *   예: 23:00 시작 → 다음날 07:00 종료
 *     ① 시작일 세션: end_at = 시작일 23:59:59.999
 *     ② 새 세션 추가: session_date = 종료일, start_at = 종료일 00:00, end_at = now
 *   여러 날 걸치면 중간 날짜는 종일 세션으로 추가.
 * - goal_progress_events 는 마지막 세션 종료일 기준 1건만 (총 duration 합산)
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
      .select('id, name, household_id, member_id, goal_id, goal_count_mode, daily_track_id')
      .eq('id', id)
      .maybeSingle();
    if (!act) {
      return NextResponse.json({ error: '활동 없음' }, { status: 404 });
    }

    // 진행 중 세션 찾기
    const { data: running } = await supabase
      .from('activity_sessions')
      .select('*')
      .eq('activity_id', id)
      .is('end_at', null)
      .maybeSingle();
    if (!running) {
      return NextResponse.json({ stopped: false, reason: 'no running session' });
    }

    const now = dayjs().tz(KST);
    const startedAt = dayjs(running.start_at as string).tz(KST);
    const startedDateKey = startedAt.format('YYYY-MM-DD');
    const nowDateKey = now.format('YYYY-MM-DD');

    let totalDurationMin = 0;
    let lastSession: Record<string, unknown> = running;

    if (startedDateKey === nowDateKey) {
      // 같은 날 — 단순 종료
      const { data: stopped, error } = await supabase
        .from('activity_sessions')
        .update({ end_at: now.toISOString() })
        .eq('id', running.id)
        .select('*')
        .single();
      if (error) throw error;
      lastSession = stopped;
      totalDurationMin = (stopped.duration_minutes as number) ?? 0;
    } else {
      // 자정 넘김 — 시작일 23:59:59 로 마감
      const startDayEnd = startedAt
        .endOf('day')
        .millisecond(0); // YYYY-MM-DD 23:59:59
      const { data: firstStopped, error: e1 } = await supabase
        .from('activity_sessions')
        .update({ end_at: startDayEnd.toISOString() })
        .eq('id', running.id)
        .select('*')
        .single();
      if (e1) throw e1;
      totalDurationMin += (firstStopped.duration_minutes as number) ?? 0;

      // 중간 날짜들 — 종일 세션 추가
      let cursor = startedAt.add(1, 'day').startOf('day');
      while (cursor.format('YYYY-MM-DD') < nowDateKey) {
        const dayEnd = cursor.endOf('day').millisecond(0);
        const { data: midSession } = await supabase
          .from('activity_sessions')
          .insert({
            activity_id: id,
            household_id: act.household_id,
            session_date: cursor.format('YYYY-MM-DD'),
            start_at: cursor.toISOString(),
            end_at: dayEnd.toISOString(),
          })
          .select('*')
          .single();
        if (midSession) {
          totalDurationMin += (midSession.duration_minutes as number) ?? 0;
        }
        cursor = cursor.add(1, 'day');
      }

      // 종료일 — 00:00:00 ~ now 새 세션
      const todayStart = now.startOf('day');
      const { data: lastInserted, error: e2 } = await supabase
        .from('activity_sessions')
        .insert({
          activity_id: id,
          household_id: act.household_id,
          session_date: nowDateKey,
          start_at: todayStart.toISOString(),
          end_at: now.toISOString(),
        })
        .select('*')
        .single();
      if (e2) throw e2;
      lastSession = lastInserted;
      totalDurationMin += (lastInserted.duration_minutes as number) ?? 0;
    }

    // 목표 진행 +1 또는 +hours (자정 넘긴 경우 총 duration 기준)
    if (act.goal_id && totalDurationMin > 0) {
      const mode = (act.goal_count_mode as string) ?? 'session';
      const delta =
        mode === 'hours' ? Math.round((totalDurationMin / 60) * 100) / 100 : 1;
      try {
        const { data: ev } = await supabase
          .from('goal_progress_events')
          .insert({
            goal_id: act.goal_id,
            household_id: act.household_id,
            occurred_on: lastSession.session_date,
            delta,
            source: 'activity_session',
            note: `활동 ${totalDurationMin}분`,
          })
          .select('id')
          .single();
        if (ev) {
          await supabase
            .from('activity_sessions')
            .update({ goal_progress_event_id: ev.id })
            .eq('id', lastSession.id);
        }
      } catch (e) {
        console.warn('[stop] goal progress fail', e);
      }
    }

    // Daily Track 자동 체크 — condition_text 가 있으면 AI 평가, 없으면 기존 동작
    let trackResult: { met: boolean; reason: string } | null = null;
    if (act.daily_track_id) {
      try {
        const { data: track } = await supabase
          .from('daily_tracks')
          .select('id, condition_text')
          .eq('id', act.daily_track_id)
          .maybeSingle();
        const conditionText = (track?.condition_text as string | undefined) ?? '';
        const trackedDate = startedDateKey; // 시작일 기준 체크 (수면 등 자정 넘는 케이스)

        // 이미 그 날짜에 체크돼있는지 확인
        const { data: existingLog } = await supabase
          .from('daily_track_logs')
          .select('id')
          .eq('track_id', act.daily_track_id)
          .eq('done_on', trackedDate)
          .limit(1)
          .maybeSingle();

        if (conditionText.trim()) {
          // AI 평가
          trackResult = await evaluateCondition(conditionText, {
            activityName: act.name as string,
            startAtIso: running.start_at as string,
            endAtIso: now.toISOString(),
            durationMinutes: totalDurationMin,
          });
          if (trackResult.met) {
            if (!existingLog) {
              await supabase.from('daily_track_logs').insert({
                track_id: act.daily_track_id,
                household_id: act.household_id,
                done_on: trackedDate,
                member_id: act.member_id,
                note: `자동: ${trackResult.reason}`,
              });
            }
          } else if (existingLog) {
            // 조건 미충족인데 이미 체크돼있으면 (start 시 잘못 체크된 경우 등) 제거
            await supabase
              .from('daily_track_logs')
              .delete()
              .eq('id', existingLog.id);
          }
        } else if (!existingLog) {
          // 조건 없으면 기존 동작 — 시작일 기준 체크 (start 라우트에서 미체크였을 수 있음)
          await supabase.from('daily_track_logs').insert({
            track_id: act.daily_track_id,
            household_id: act.household_id,
            done_on: trackedDate,
            member_id: act.member_id,
          });
        }
      } catch (e) {
        console.warn('[stop] daily track condition eval fail', e);
      }
    }

    return NextResponse.json({
      session: lastSession,
      stopped: true,
      total_duration_min: totalDurationMin,
      split: startedDateKey !== nowDateKey,
      track_evaluated: trackResult,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
