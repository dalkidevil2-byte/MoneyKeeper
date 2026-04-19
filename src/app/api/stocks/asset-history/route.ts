export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/stocks/asset-history?household_id=&start_date=&end_date=
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  let query = supabase
    .from('stock_asset_history')
    .select('*')
    .eq('household_id', householdId);

  if (startDate) query = query.gte('date', startDate);
  if (endDate) query = query.lte('date', endDate);

  const { data, error } = await query.order('date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ history: data });
}

// POST /api/stocks/asset-history (upsert by household+date)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  if (!body.date) {
    return NextResponse.json({ error: 'date가 필요합니다.' }, { status: 400 });
  }
  if (body.total_value === undefined || body.total_value === null) {
    return NextResponse.json({ error: 'total_value가 필요합니다.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('stock_asset_history')
    .upsert(
      {
        household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
        date: body.date,
        total_value: body.total_value,
      },
      { onConflict: 'household_id,date' }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data }, { status: 201 });
}
