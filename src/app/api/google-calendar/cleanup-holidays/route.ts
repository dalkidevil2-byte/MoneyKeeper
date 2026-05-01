export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 이미 import 된 공휴일/생일 캘린더 이벤트를 우리 앱에서 제거 (cancelled).
 * 구글 쪽 데이터는 건드리지 않음.
 *
 * 매칭 방법 3가지:
 * 1) google_calendar_id 가 holiday 류 패턴
 * 2) 제목이 한국 공휴일/기념일/24절기 이름과 정확히 일치
 * 3) (보호) memo 가 비어있고 시간 없는 종일 일정 + 이름이 자주 쓰는 휴일명
 */

// 한국 공휴일 + 절기 + 잡절 이름 (정확 매칭)
const HOLIDAY_TITLES = new Set<string>([
  // 공휴일
  '새해첫날', '신정', '설날', '설날 연휴', '설날연휴',
  '삼일절', '3·1절', '3.1절',
  '식목일', '노동절', '근로자의 날', '근로자의날',
  '어린이날', '어버이날', '스승의날', '스승의 날',
  '석가탄신일', '부처님오신날', '부처님 오신 날', '석가모니 탄신일',
  '현충일', '제헌절', '광복절',
  '추석', '추석 연휴', '추석연휴',
  '개천절', '한글날',
  '성탄절', '크리스마스', '크리스마스이브', '크리스마스 이브',
  '대체 공휴일', '대체공휴일',
  '국군의 날', '국군의날',
  '발렌타인데이', '발렌타인 데이', '화이트데이', '화이트 데이',
  '빼빼로데이',
  // 24절기
  '입춘', '우수', '경칩', '춘분', '청명', '곡우',
  '입하', '소만', '망종', '하지', '소서', '대서',
  '입추', '처서', '백로', '추분', '한로', '상강',
  '입동', '소설', '대설', '동지', '소한', '대한',
  // 음력 잡절
  '대보름', '정월대보름', '한식', '단오', '칠석', '백중', '동지팥죽',
]);

export async function POST() {
  const supabase = createServerSupabaseClient();

  let totalCalendar = 0;
  let totalTitle = 0;

  // 1) google_calendar_id 패턴 매칭
  const patterns = [
    '%holiday@group.v.calendar.google.com',
    '%addressbook#contacts@group%',
  ];
  for (const p of patterns) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', is_active: false })
      .eq('household_id', HOUSEHOLD_ID)
      .eq('kind', 'event')
      .eq('is_active', true)
      .like('google_calendar_id', p)
      .select('id');
    if (error) console.warn('[cleanup-holidays] cal-pattern', error);
    totalCalendar += data?.length ?? 0;
  }

  // 2) 제목으로 일괄 매칭 (이미 import 된 옛 데이터 — google_calendar_id NULL 일 수도)
  const titleArr = Array.from(HOLIDAY_TITLES);
  const { data: titleHits, error: titleErr } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', is_active: false })
    .eq('household_id', HOUSEHOLD_ID)
    .eq('kind', 'event')
    .eq('is_active', true)
    .in('title', titleArr)
    .select('id');
  if (titleErr) console.warn('[cleanup-holidays] title', titleErr);
  totalTitle += titleHits?.length ?? 0;

  return NextResponse.json({
    success: true,
    removed: totalCalendar + totalTitle,
    by_calendar: totalCalendar,
    by_title: totalTitle,
  });
}
