export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// PATCH — 매핑/이름/활성화 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const allowed = [
      'name',
      'title_property',
      'date_property',
      'member_property',
      'category_property',
      'filter_property',
      'is_active',
      'notion_token',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('todo_notion_sources')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({
      source: { ...data, notion_token: '••••••••' },
    });
  } catch (error) {
    console.error('[PATCH /todo/notion-sources/:id]', error);
    return NextResponse.json({ error: '수정 중 오류' }, { status: 500 });
  }
}

// DELETE
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase.from('todo_notion_sources').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /todo/notion-sources/:id]', error);
    return NextResponse.json({ error: '삭제 중 오류' }, { status: 500 });
  }
}
