export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
// 추적 기간: 2년 (이관 데이터 포함)
const TRACK_SINCE = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

type ItemRecord = {
  id?: string;              // items.id (편집용)
  transaction_id?: string;  // 편집용
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
    .neq('status', 'cancelled')
    .gte('date', TRACK_SINCE)
    .order('date', { ascending: true });

  if (!txs || txs.length === 0) return NextResponse.json({ items: [] });

  const txMap = new Map(txs.map((t) => [t.id, t]));
  const txIds = [...txMap.keys()];

  // key: "품목명__단위" 로 묶어 단위별 단가 비교를 정확하게
  const itemMap = new Map<string, { name: string; unit: string; category: string; records: ItemRecord[] }>();

  // ── Source 1: items 테이블 — 추적 체크된 품목만 ──
  const { data: itemRows } = await supabase
    .from('items')
    .select('id, name, price, quantity, unit_price, unit, category_main, transaction_id, track')
    .in('transaction_id', txIds)
    .eq('track', true);

  for (const row of itemRows ?? []) {
    const tx = txMap.get(row.transaction_id);
    if (!tx) continue;
    const name = row.name?.trim();
    if (!name || name.length < 2) continue;
    const unit = row.unit?.trim() || '개';
    const key = `${name}__${unit}`;

    if (!itemMap.has(key)) {
      itemMap.set(key, { name, unit, category: row.category_main || '기타', records: [] });
    }
    itemMap.get(key)!.records.push({
      id: row.id,
      transaction_id: row.transaction_id,
      date: tx.date,
      price: row.price,
      unit_price: row.unit_price ?? row.price,
      quantity: row.quantity ?? 1,
      unit,
      store: tx.merchant_name || '알 수 없음',
    });
  }

  // Source 2(거래명 기반 fallback)는 제거 — track 플래그 도입 후 items 테이블만 사용

  const items = [...itemMap.values()]
    .map(({ name, unit, category, records }) => {
      // 날짜순 정렬 — 1회 구매도 기본 정보는 표시 (가격 비교는 2회 이상부터)
      records.sort((a, b) => a.date.localeCompare(b.date));

      const unitPrices = records.map((r) => r.unit_price);
      const avgUnitPrice = Math.round(unitPrices.reduce((s, p) => s + p, 0) / unitPrices.length);
      const minUnitPrice = Math.min(...unitPrices);
      const maxUnitPrice = Math.max(...unitPrices);
      const cheapest = records.reduce((m, r) => (r.unit_price < m.unit_price ? r : m), records[0]);

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
        unit,
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
