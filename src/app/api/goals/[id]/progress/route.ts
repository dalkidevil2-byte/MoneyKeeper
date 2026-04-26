export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// POST — 수동 진행 이벤트 추가  body: { delta?, occurred_on?, note? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json().catch(() => ({}));
    const delta = Number(body.delta ?? 1);
    const occurredOn: string = body.occurred_on ?? dayjs().format('YYYY-MM-DD');
    const note: string = body.note ?? '';

    const { data: goal } = await supabase
      .from('goals')
      .select('id, household_id')
      .eq('id', id)
      .single();
    if (!goal) {
      return NextResponse.json({ error: '목표를 찾을 수 없습니다.' }, { status: 404 });
    }

    const { error } = await supabase.from('goal_progress_events').insert({
      goal_id: id,
      household_id: goal.household_id ?? DEFAULT_HOUSEHOLD_ID,
      occurred_on: occurredOn,
      delta,
      source: 'manual',
      note,
    });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[POST /goals/:id/progress]', error);
    return NextResponse.json({ error: error?.message ?? '실패' }, { status: 500 });
  }
}

// DELETE — 가장 최근 이벤트 한 건 제거 (-1 동작)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: latest } = await supabase
      .from('goal_progress_events')
      .select('id')
      .eq('goal_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      await supabase.from('goal_progress_events').delete().eq('id', latest.id);
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[DELETE /goals/:id/progress]', error);
    return NextResponse.json({ error: '실패' }, { status: 500 });
  }
}
