export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// PATCH /api/transactions/[id] - 거래 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id } = await params;

  const { data, error } = await supabase
    .from('transactions')
    .update({
      date: body.date,
      type: body.type,
      amount: body.amount,
      name: body.name ?? '',
      merchant_name: body.merchant_name ?? '',
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      payment_method_id: body.payment_method_id ?? null,
      account_from_id: body.account_from_id ?? null,
      account_to_id: body.account_to_id ?? null,
      member_id: body.member_id ?? null,
      target_member_id: body.target_member_id ?? null,
      receipt_url: body.receipt_url ?? '',
      memo: body.memo ?? '',
    })
    .eq('id', id)
    .select(`
      *,
      member:members!member_id(id, name, color),
      target_member:members!target_member_id(id, name, color),
      account_from:accounts!account_from_id(id, name, type),
      account_to:accounts!account_to_id(id, name, type),
      payment_method:payment_methods(id, name, type)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transaction: data });
}

// DELETE /api/transactions/[id] - 거래 삭제 (소프트 삭제)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
