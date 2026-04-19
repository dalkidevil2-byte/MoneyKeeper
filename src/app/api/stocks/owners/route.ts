export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/owners - 주식 계좌 소유자 목록
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const { data, error } = await supabase
    .from('stock_owners')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ owners: data });
}

// POST /api/stocks/owners - 소유자 생성
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: '이름을 입력해주세요.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stock_owners')
    .insert({
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      name: body.name,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ owner: data }, { status: 201 });
}
