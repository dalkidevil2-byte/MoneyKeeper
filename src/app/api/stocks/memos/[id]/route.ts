export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// PATCH /api/stocks/memos/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id } = await params;

  const updates: Record<string, unknown> = {};
  if (body.ticker !== undefined) updates.ticker = body.ticker;
  if (body.content !== undefined) updates.content = body.content;

  const { data, error } = await supabase
    .from('stock_memos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ memo: data });
}

// DELETE /api/stocks/memos/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;

  const { error } = await supabase.from('stock_memos').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
