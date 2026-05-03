export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const allowed = [
      'billing_period_start',
      'billing_period_end',
      'payment_due_date',
      'billed_amount',
      'account_id',
      'memo',
      'status',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) if (k in body) update[k] = body[k];
    if (typeof update.billed_amount === 'number') {
      update.billed_amount = Math.round(update.billed_amount);
    }
    const { data, error } = await supabase
      .from('card_statements')
      .update(update)
      .eq('id', id)
      .select(
        `*, payment_method:payment_methods(id, name, type), account:accounts!account_id(id, name)`,
      )
      .single();
    if (error) throw error;
    return NextResponse.json({ statement: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseClient();
  try {
    const { error } = await supabase.from('card_statements').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
