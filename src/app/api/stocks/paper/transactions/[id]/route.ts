export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id } = await params;

  const updates: Record<string, unknown> = {};
  if (body.ticker !== undefined) updates.ticker = body.ticker;
  if (body.company_name !== undefined) updates.company_name = body.company_name;
  if (body.type !== undefined) {
    if (!['BUY', 'SELL'].includes(body.type))
      return NextResponse.json({ error: "type은 BUY 또는 SELL" }, { status: 400 });
    updates.type = body.type;
  }
  if (body.date !== undefined) updates.date = body.date;
  if (body.quantity !== undefined) updates.quantity = body.quantity;
  if (body.price !== undefined) updates.price = body.price;
  if (body.memo !== undefined) updates.memo = body.memo;
  if (body.account_id !== undefined) updates.account_id = body.account_id;

  const { data, error } = await supabase
    .from('paper_transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;
  const { error } = await supabase.from('paper_transactions').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
