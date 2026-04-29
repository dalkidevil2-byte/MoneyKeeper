export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('fixed_expense_templates')
    .select(`
      *,
      payment_method:payment_methods(id, name, type),
      account_from:accounts!account_from_id(id, name),
      account_to:accounts!account_to_id(id, name)
    `)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('is_active', true)
    .order('due_day');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('fixed_expense_templates')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: body.name,
      amount: body.amount,
      due_day: body.due_day,
      type: body.type ?? 'fixed_expense',
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      payment_method_id: body.payment_method_id ?? null,
      account_from_id: body.account_from_id ?? null,
      account_to_id: body.account_to_id ?? null,
      is_variable: body.is_variable ?? false,
    })
    .select(`
      *,
      payment_method:payment_methods(id, name, type),
      account_from:accounts!account_from_id(id, name),
      account_to:accounts!account_to_id(id, name)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json();

  const allowed = [
    'name',
    'amount',
    'due_day',
    'type',
    'category_main',
    'category_sub',
    'payment_method_id',
    'account_from_id',
    'account_to_id',
    'is_variable',
    'is_active',
  ] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      update[key] = body[key];
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '수정할 내용이 없습니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('fixed_expense_templates')
    .update(update)
    .eq('id', id)
    .select(`
      *,
      payment_method:payment_methods(id, name, type),
      account_from:accounts!account_from_id(id, name),
      account_to:accounts!account_to_id(id, name)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('fixed_expense_templates')
    .update({ is_active: false })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
