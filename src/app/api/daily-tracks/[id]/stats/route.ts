export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

// GET /api/daily-tracks/[id]/stats?days=84
// 최근 N일 일별 카운트 + streak / total / 평균 통계
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const days = parseInt(new URL(req.url).searchParams.get('days') ?? '84');

  try {
    const { data: track, error: tErr } = await supabase
      .from('daily_tracks')
      .select(`*, member:members!member_id(id, name, color)`)
      .eq('id', id)
      .single();
    if (tErr || !track) {
      return NextResponse.json({ error: '트랙을 찾을 수 없습니다.' }, { status: 404 });
    }

    const today = dayjs();
    const startDate = today.subtract(days - 1, 'day').format('YYYY-MM-DD');

    // 전체 로그 조회 (streak 계산을 위해 days 보다 더 길게)
    const { data: allLogs } = await supabase
      .from('daily_track_logs')
      .select('done_on, member_id')
      .eq('track_id', id)
      .order('done_on', { ascending: true });

    // 일별 카운트 맵
    const countByDate: Record<string, number> = {};
    for (const l of allLogs ?? []) {
      const d = l.done_on as string;
      countByDate[d] = (countByDate[d] ?? 0) + 1;
    }

    // 표시용 최근 N일 배열
    const history: { date: string; count: number; isDoneDay: boolean }[] = [];
    const targetCount = track.target_count as number;
    const periodUnit = track.period_unit as 'day' | 'week' | 'month';
    for (let i = 0; i < days; i++) {
      const d = today.subtract(days - 1 - i, 'day').format('YYYY-MM-DD');
      const cnt = countByDate[d] ?? 0;
      history.push({
        date: d,
        count: cnt,
        // day 단위 목표라면 그날 cnt >= target. 주/월 은 그날 활동 있었는지로 표시
        isDoneDay: periodUnit === 'day' ? cnt >= targetCount : cnt > 0,
      });
    }

    // 누적 통계
    const totalCount = (allLogs ?? []).length;
    const totalDays = Object.keys(countByDate).length;

    // 이번 주/이번 달 카운트
    const weekStart = today.startOf('week').format('YYYY-MM-DD');
    const monthStart = today.startOf('month').format('YYYY-MM-DD');
    let thisWeekCount = 0;
    let thisMonthCount = 0;
    for (const l of allLogs ?? []) {
      const d = l.done_on as string;
      if (d >= weekStart) thisWeekCount++;
      if (d >= monthStart) thisMonthCount++;
    }

    // 현재 / 최장 streak (day 단위만 의미 있음, 주/월은 단순 1회 이상 day 카운트)
    const isPassDay = (d: string): boolean => {
      const c = countByDate[d] ?? 0;
      return periodUnit === 'day' ? c >= targetCount : c > 0;
    };

    let currentStreak = 0;
    {
      // 오늘부터 거꾸로
      let cur = today;
      while (true) {
        const d = cur.format('YYYY-MM-DD');
        if (isPassDay(d)) {
          currentStreak++;
          cur = cur.subtract(1, 'day');
        } else {
          // 오늘 아직 못 채웠으면 어제부터 카운트
          if (currentStreak === 0 && cur.isSame(today, 'day')) {
            cur = cur.subtract(1, 'day');
            continue;
          }
          break;
        }
      }
    }

    let bestStreak = 0;
    {
      // 모든 날짜를 정렬하고 연속 구간 검사
      const sortedDates = Object.keys(countByDate)
        .filter((d) => isPassDay(d))
        .sort();
      let run = 0;
      let prev: dayjs.Dayjs | null = null;
      for (const d of sortedDates) {
        const cur = dayjs(d);
        if (prev && cur.diff(prev, 'day') === 1) {
          run++;
        } else {
          run = 1;
        }
        if (run > bestStreak) bestStreak = run;
        prev = cur;
      }
    }

    // 시작일 이후 날짜 수 (운영 일수)
    let activeDays = days;
    if (track.start_date) {
      const sinceStart = today.diff(dayjs(track.start_date as string), 'day') + 1;
      activeDays = Math.max(1, Math.min(activeDays, sinceStart));
    }

    return NextResponse.json({
      track,
      stats: {
        history,                  // 최근 N일 [{date, count, isDoneDay}]
        total_count: totalCount,
        total_days: totalDays,
        current_streak: currentStreak,
        best_streak: bestStreak,
        this_week_count: thisWeekCount,
        this_month_count: thisMonthCount,
        active_days: activeDays,
        completion_rate:
          activeDays > 0 ? Math.round((totalDays / activeDays) * 100) : 0,
      },
    });
  } catch (e: any) {
    console.error('[GET /daily-tracks/:id/stats]', e);
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
