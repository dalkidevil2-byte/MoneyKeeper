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
  if (body.date !== undefined) updates.date = body.date;
  if (body.type !== undefined) {
    if (!['DEPOSIT', 'WITHDRAW'].includes(body.type)) {
      return NextResponse.json({ error: "type은 'DEPOSIT' 또는 'WITHDRAW'" }, { status: 400 });
    }
    updates.type = body.type;
  }
  if (body.amount !== undefined) updates.amount = body.amount;
  if (body.memo !== undefined) updates.memo = body.memo;
  if (body.account_id !== undefined) updates.account_id = body.account_id;

  const { data, error } = await supabase
    .from('stock_cash_flows')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flow: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;

  const { error } = await supabase.from('stock_cash_flows').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
