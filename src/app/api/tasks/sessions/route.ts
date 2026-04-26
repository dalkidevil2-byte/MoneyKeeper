export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/tasks/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD
// 기간 내 모든 세션 (task 정보 join)
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  try {
    let q = supabase
      .from('task_work_sessions')
      .select(`
        *,
        task:tasks!task_id(
          id, title, member_id, target_member_ids, kind, status,
          deadline_date, deadline_time, category_main,
          member:members!member_id(id, name, color)
        )
      `)
      .eq('household_id', householdId)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });
    if (from) q = q.gte('session_date', from);
    if (to) q = q.lte('session_date', to);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
