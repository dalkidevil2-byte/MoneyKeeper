export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim();
  if (!name || name.length < 2) return NextResponse.json({ hint: null });

  const supabase = createServerSupabaseClient();

  // 이 가계의 거래 ID 목록
  const { data: txIds } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID);

  if (!txIds?.length) return NextResponse.json({ hint: null });

  const ids = txIds.map((t) => t.id);

  // 1. 정확히 일치하는 품목명 조회
  const { data: exact } = await supabase
    .from('items')
    .select('unit')
    .eq('name', name)
    .in('transaction_id', ids);

  if (exact && exact.length > 0) {
    const best = getBestUnit(exact.map((r) => r.unit));
    if (best) return NextResponse.json({ hint: { unit: best.unit, count: best.count } });
  }

  // 2. 부분 일치 (ILIKE)
  const { data: partial } = await supabase
    .from('items')
    .select('unit')
    .ilike('name', `%${name}%`)
    .in('transaction_id', ids);

  if (partial && partial.length > 0) {
    const best = getBestUnit(partial.map((r) => r.unit));
    if (best) return NextResponse.json({ hint: { unit: best.unit, count: best.count } });
  }

  return NextResponse.json({ hint: null });
}

function getBestUnit(units: string[]): { unit: string; count: number } | null {
  if (!units.length) return null;
  const freq: Record<string, number> = {};
  for (const u of units) {
    if (u) freq[u] = (freq[u] ?? 0) + 1;
  }
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted[0] ? { unit: sorted[0][0], count: sorted[0][1] } : null;
}
