export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 한 task 의 체크리스트 조회
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('task_checklist_items')
      .select('*')
      .eq('task_id', id)
      .order('position', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// POST — 새 항목 추가  body: { title }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    if (!title) {
      return NextResponse.json({ error: '내용을 입력해주세요.' }, { status: 400 });
    }
    // 현재 max position + 1
    const { data: last } = await supabase
      .from('task_checklist_items')
      .select('position')
      .eq('task_id', id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: task } = await supabase
      .from('tasks')
      .select('household_id')
      .eq('id', id)
      .maybeSingle();
    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert({
        task_id: id,
        household_id: task?.household_id ?? DEFAULT_HOUSEHOLD_ID,
        title,
        position: (last?.position ?? -1) + 1,
      })
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// PATCH — 한 항목 수정/체크 토글  body: { item_id, title?, is_done? }
export async function PATCH(
  req: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> },
) {
  await _params; // unused but required
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const itemId = body.item_id as string | undefined;
    if (!itemId) {
      return NextResponse.json({ error: 'item_id 필요' }, { status: 400 });
    }
    const update: Record<string, unknown> = {};
    if (typeof body.title === 'string') update.title = body.title;
    if (typeof body.is_done === 'boolean') {
      update.is_done = body.is_done;
      update.done_at = body.is_done ? new Date().toISOString() : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'estimated_minutes')) {
      update.estimated_minutes = body.estimated_minutes;
    }
    const { data, error } = await supabase
      .from('task_checklist_items')
      .update(update)
      .eq('id', itemId)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// DELETE  ?item_id=...
export async function DELETE(
  req: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> },
) {
  await _params;
  const supabase = createServerSupabaseClient();
  const itemId = new URL(req.url).searchParams.get('item_id');
  if (!itemId) {
    return NextResponse.json({ error: 'item_id 필요' }, { status: 400 });
  }
  try {
    const { error } = await supabase.from('task_checklist_items').delete().eq('id', itemId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
