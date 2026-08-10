export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true)
    // 자주 쓰는 사람(우리가족)이 앞에 오도록 sort_order 우선.
    // 값이 없거나 같으면 기존처럼 등록순.
    .order('sort_order', { ascending: true })
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('members')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: body.name,
      color: body.color,
      role: 'member',
      is_active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data }, { status: 201 });
}
