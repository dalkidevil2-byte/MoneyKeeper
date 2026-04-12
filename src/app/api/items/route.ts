export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const ONE_YEAR_AGO = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

type ItemRecord = {
  date: string;
  price: number;
  unit_price: number;
  quantity: number;
  unit: string;
  store: string;
};

export async function GET() {
  const supabase = createServerSupabaseClient();

  // 이 가계의 최근 1년 거래 목록 (id, date, merchant_name)
  const { data: txs } = await supabase
    .from('transactions')
    .select('id, date, merchant_name, name, amount, category_main, type')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .gte('date', ONE_YEAR_AGO)
    .order('date', { ascending: true });

  if (!txs || txs.length === 0) return NextResponse.json({ items: [] });

  const txMap = new Map(txs.map((t) => [t.id, t]));
  const txIds = [...txMap.keys()];

  const itemMap = new Map<string, { category: string; records: ItemRecord[] }>();

  // ── Source 1: items 테이블 (명시적 품목 입력) ──
  const { data: itemRows } = await supabase
    .from('items')
    .select('id, name, price, quantity, unit_price, unit, category_main, transaction_id')
    .in('transaction_id', txIds);

  for (const row of itemRows ?? []) {
    const tx = txMap.get(row.transaction_id);
    if (!tx) continue;
    const name = row.name?.trim();
    if (!name || name.length < 2) continue;

    if (!itemMap.has(name)) {
      itemMap.set(name, { category: row.category_main || '기타', records: [] });
    }
    itemMap.get(name)!.records.push({
      date: tx.date,
      price: row.price,
      unit_price: row.unit_price ?? row.price,
      quantity: row.quantity ?? 1,
      unit: row.unit || '개',
      store: tx.merchant_name || '알 수 없음',
    });
  }

  // items 테이블에 품목이 있는 거래 ID 집합 (fallback 중복 방지용)
  const txIdsWithItems = new Set((itemRows ?? []).map((r) => r.transaction_id));

  // ── Source 2: OCR 방식 거래 (name ≠ merchant_name) 레거시 fallback ──
  for (const tx of txs) {
    if (tx.type !== 'variable_expense') continue;
    // items 테이블에 이미 품목이 있는 거래는 skip
    if (txIdsWithItems.has(tx.id)) continue;
    const name = tx.name?.trim();
    if (!name || name.length < 2) continue;
    if (!tx.merchant_name || tx.merchant_name === tx.name) continue;

    if (!itemMap.has(name)) {
      itemMap.set(name, { category: tx.category_main || '기타', records: [] });
    }
    itemMap.get(name)!.records.push({
      date: tx.date,
      price: tx.amount,
      unit_price: tx.amount,
      quantity: 1,
      unit: '개',
      store: tx.merchant_name,
    });
  }

  const items = [...itemMap.entries()]
    .map(([name, { category, records }]) => {
      // 날짜순 정렬
      records.sort((a, b) => a.date.localeCompare(b.date));
      if (records.length < 2) return null;

      const unitPrices = records.map((r) => r.unit_price);
      const avgUnitPrice = Math.round(unitPrices.reduce((s, p) => s + p, 0) / unitPrices.length);
      const minUnitPrice = Math.min(...unitPrices);
      const maxUnitPrice = Math.max(...unitPrices);
      const cheapest = records.reduce((m, r) => (r.unit_price < m.unit_price ? r : m), records[0]);

      // 가장 많이 쓰인 단위
      const unitCount: Record<string, number> = {};
      records.forEach((r) => { unitCount[r.unit] = (unitCount[r.unit] ?? 0) + 1; });
      const primaryUnit = Object.entries(unitCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '개';

      // 매장별 단가 평균
      const storeMap: Record<string, number[]> = {};
      for (const r of records) {
        if (!storeMap[r.store]) storeMap[r.store] = [];
        storeMap[r.store].push(r.unit_price);
      }
      const storeAvg = Object.entries(storeMap)
        .map(([store, ups]) => ({
          store,
          avg: Math.round(ups.reduce((s, u) => s + u, 0) / ups.length),
          count: ups.length,
        }))
        .sort((a, b) => a.avg - b.avg);

      // 구매 주기
      const dates = records.map((r) => new Date(r.date).getTime());
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }
      const avgGap = gaps.length > 0
        ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length)
        : null;

      return {
        name,
        category,
        unit: primaryUnit,
        count: records.length,
        avgUnitPrice,
        minUnitPrice,
        maxUnitPrice,
        lastDate: records[records.length - 1].date,
        cheapest,
        storeAvg,
        avgGap,
        history: records,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.count - a!.count);

  return NextResponse.json({ items });
}
