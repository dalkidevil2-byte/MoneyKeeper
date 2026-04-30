export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 이미 import 된 공휴일/생일 캘린더 이벤트를 우리 앱에서 제거 (cancelled).
 * 구글 쪽 데이터는 건드리지 않음.
 */
export async function POST() {
  const supabase = createServerSupabaseClient();

  // google_calendar_id 가 holiday 류 패턴인 task 들
  const patterns = [
    '%holiday@group.v.calendar.google.com',
    '%addressbook#contacts@group%',
  ];
  let total = 0;
  for (const p of patterns) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', is_active: false })
      .eq('household_id', HOUSEHOLD_ID)
      .like('google_calendar_id', p)
      .select('id');
    if (error) console.warn('[cleanup-holidays]', error);
    total += data?.length ?? 0;
  }

  return NextResponse.json({ success: true, removed: total });
}
