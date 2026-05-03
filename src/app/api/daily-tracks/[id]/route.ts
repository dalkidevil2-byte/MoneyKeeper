export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const allowed = [
      'title', 'emoji', 'category_main',
      'member_id', 'target_member_ids',
      'target_count', 'period_unit',
      'start_date', 'end_date',
      'weekdays', 'until_count', 'reminder_time', 'goal_id',
      'is_active', 'position', 'condition_text',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 내용 없음' }, { status: 400 });
    }

    const tryUpdate = async (patch: Record<string, unknown>) =>
      supabase
        .from('daily_tracks')
        .update(patch)
        .eq('id', id)
        .select(`*, member:members!member_id(id, name, color)`)
        .single();

    let { data, error } = await tryUpdate(update);

    // 마이그레이션 미적용 컬럼이 있으면 (condition_text 등) 자동 제외 후 재시도
    if (error && /column .* does not exist/i.test(error.message ?? '')) {
      const m = (error.message ?? '').match(/column "?([\w.]+)"? does not exist/i);
      const missingCol = m?.[1]?.replace(/^daily_tracks\./, '');
      if (missingCol && missingCol in update) {
        const reduced = { ...update };
        delete reduced[missingCol];
        const retry = await tryUpdate(reduced);
        data = retry.data;
        error = retry.error;
      }
    }

    if (error) throw error;
    return NextResponse.json({ track: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase.from('daily_tracks').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
