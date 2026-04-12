export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const merchant = searchParams.get('merchant')?.trim();
  if (!merchant) return NextResponse.json({ hint: null });

  const supabase = createServerSupabaseClient();

  // 1차: 정확히 같은 merchant_name
  // 2차: merchant_name 포함 (부분 일치)
  const { data } = await supabase
    .from('transactions')
    .select('category_main, category_sub')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .or(`merchant_name.eq.${merchant},name.eq.${merchant}`)
    .not('category_main', 'eq', '')
    .order('created_at', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) {
    // 부분 일치 시도
    const { data: partial } = await supabase
      .from('transactions')
      .select('category_main, category_sub')
      .eq('household_id', DEFAULT_HOUSEHOLD_ID)
      .ilike('merchant_name', `%${merchant}%`)
      .not('category_main', 'eq', '')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!partial || partial.length === 0) return NextResponse.json({ hint: null });

    return NextResponse.json({ hint: getBestCategory(partial) });
  }

  return NextResponse.json({ hint: getBestCategory(data) });
}

function getBestCategory(rows: { category_main: string; category_sub: string }[]) {
  // category_main + category_sub 조합으로 빈도 계산
  const freq: Record<string, { category_main: string; category_sub: string; count: number }> = {};
  for (const row of rows) {
    const key = `${row.category_main}__${row.category_sub}`;
    if (!freq[key]) freq[key] = { category_main: row.category_main, category_sub: row.category_sub, count: 0 };
    freq[key].count++;
  }
  const sorted = Object.values(freq).sort((a, b) => b.count - a.count);
  const best = sorted[0];
  return {
    category_main: best.category_main,
    category_sub: best.category_sub,
    count: best.count,
    total: rows.length,
  };
}
