export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// PATCH — 활동 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const allowed = [
      'name', 'emoji', 'color', 'category', 'member_id',
      'is_favorite', 'is_active', 'position',
      'goal_id', 'daily_track_id', 'goal_count_mode',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 내용 없음' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('activities')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ activity: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

// DELETE — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase
      .from('activities')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
