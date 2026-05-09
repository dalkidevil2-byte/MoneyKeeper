export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET /api/transactions/category-summary?start_date=&end_date=
 *
 * 카테고리별 변동지출 집계 — 세부 품목 카테고리 우선, 없으면 거래 카테고리 fallback.
 *
 * 응답:
 * {
 *   "byMain": { "식비": 120000, "의류": 50000, ... },
 *   "bySub": { "식비/마트": 80000, "식비/카페": 40000, ... }
 * }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');

  const supabase = createServerSupabaseClient();

  let txQuery = supabase
    .from('transactions')
    .select('id, amount, category_main, category_sub, type, status')
    .eq('household_id', householdId)
    .eq('type', 'variable_expense')
    .neq('status', 'cancelled');
  if (startDate) txQuery = txQuery.gte('date', startDate);
  if (endDate) txQuery = txQuery.lte('date', endDate);

  const { data: txs, error } = await txQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const txIds = (txs ?? []).map((t) => t.id as string);
  let itemsByTx: Record<string, Array<{ price: number; category_main: string; category_sub: string }>> = {};
  if (txIds.length > 0) {
    const { data: items } = await supabase
      .from('transaction_items')
      .select('transaction_id, price, category_main, category_sub')
      .in('transaction_id', txIds);
    for (const it of items ?? []) {
      const txId = it.transaction_id as string;
      if (!itemsByTx[txId]) itemsByTx[txId] = [];
      itemsByTx[txId].push({
        price: Number(it.price) || 0,
        category_main: (it.category_main as string) || '',
        category_sub: (it.category_sub as string) || '',
      });
    }
  }

  const byMain: Record<string, number> = {};
  const bySub: Record<string, number> = {};

  const addByCat = (main: string, sub: string, amount: number) => {
    const m = main || '기타';
    byMain[m] = (byMain[m] ?? 0) + amount;
    const subKey = `${m}/${sub || '미분류'}`;
    bySub[subKey] = (bySub[subKey] ?? 0) + amount;
  };

  for (const t of txs ?? []) {
    const txAmount = Number(t.amount) || 0;
    const txMain = (t.category_main as string) || '';
    const txSub = (t.category_sub as string) || '';
    const items = itemsByTx[t.id as string] ?? [];

    if (items.length === 0) {
      // 세부 품목 없음 → 거래 자체 카테고리로
      addByCat(txMain, txSub, txAmount);
      continue;
    }

    // 세부 품목별로 분배 — 카테고리 있는 품목은 그쪽에, 없는 품목은 거래 카테고리에
    let categorizedSum = 0;
    for (const it of items) {
      if (it.category_main) {
        addByCat(it.category_main, it.category_sub, it.price);
        categorizedSum += it.price;
      } else {
        addByCat(txMain, txSub, it.price);
        categorizedSum += it.price;
      }
    }
    // 품목 합계 ≠ 거래 금액 (할인 등)인 경우 차이는 거래 카테고리에
    const diff = txAmount - categorizedSum;
    if (Math.abs(diff) > 1) {
      addByCat(txMain, txSub, diff);
    }
  }

  return NextResponse.json({ byMain, bySub });
}
