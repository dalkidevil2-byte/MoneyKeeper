export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET /api/activities/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 날짜 범위 활동 세션 (활동 정보 join)
 */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to') ?? from;
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    let q = supabase
      .from('activity_sessions')
      .select(`
        *,
        activity:activities!activity_id(id, name, emoji, color)
      `)
      .eq('household_id', householdId)
      .order('start_at', { ascending: true });
    if (from) q = q.gte('session_date', from);
    if (to) q = q.lte('session_date', to);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
