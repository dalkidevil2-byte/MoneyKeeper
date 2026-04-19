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
  if (body.broker_name !== undefined) updates.broker_name = body.broker_name;
  if (body.account_number !== undefined) updates.account_number = body.account_number;
  if (body.owner_id !== undefined) updates.owner_id = body.owner_id;

  const { data, error } = await supabase
    .from('paper_accounts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;
  const { error } = await supabase.from('paper_accounts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
