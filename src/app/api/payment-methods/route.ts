export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const { data, error } = await supabase
    .from('payment_methods')
    .select('*, linked_account:accounts!linked_account_id(id, name, type)')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment_methods: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('payment_methods')
    .insert({
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      member_id: body.member_id ?? null,
      name: body.name,
      type: body.type ?? 'debit_card',
      linked_account_id: body.linked_account_id ?? null,
      billing_account_id: body.billing_account_id ?? null,
      billing_day: body.billing_day ?? null,
      is_budget_card: body.is_budget_card ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment_method: data }, { status: 201 });
}
