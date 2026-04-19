export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const ownerId = searchParams.get('owner_id');
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  if (ownerId) {
    const { data, error } = await supabase
      .from('paper_accounts')
      .select('*, owner:paper_owners!owner_id(id, name, household_id)')
      .eq('owner_id', ownerId)
      .order('created_at');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ accounts: data });
  }

  const { data: owners, error: ownerErr } = await supabase
    .from('paper_owners')
    .select('id')
    .eq('household_id', householdId);

  if (ownerErr) return NextResponse.json({ error: ownerErr.message }, { status: 500 });
  const ownerIds = (owners ?? []).map((o) => o.id);
  if (ownerIds.length === 0) return NextResponse.json({ accounts: [] });

  const { data, error } = await supabase
    .from('paper_accounts')
    .select('*, owner:paper_owners!owner_id(id, name, household_id)')
    .in('owner_id', ownerIds)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.owner_id)
    return NextResponse.json({ error: 'owner_id가 필요합니다.' }, { status: 400 });

  const { data, error } = await supabase
    .from('paper_accounts')
    .insert({
      owner_id: body.owner_id,
      broker_name: body.broker_name ?? '',
      account_number: body.account_number ?? '',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ account: data }, { status: 201 });
}
