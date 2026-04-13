export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET() {
  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      member:members!member_id(id, name, color),
      payment_method:payment_methods(id, name, type)
    `)
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .eq('sync_status', 'pending')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data ?? [] });
}
