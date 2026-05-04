export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET /api/transactions/suggest?name=&merchant=
 *
 * 과거 거래에서 가장 자주 등장한 패턴을 학습해 자동완성 추천.
 * - name → 가맹점/카테고리 추천
 * - merchant → 항목/카테고리 추천
 *
 * 응답 예:
 * {
 *   "merchant_name": "스타벅스",
 *   "category_main": "식비",
 *   "category_sub": "카페",
 *   "payment_method_id": "uuid",
 *   "account_from_id": null,
 *   "frequency": 12,
 *   "last_used": "2026-04-10"
 * }
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = (searchParams.get('name') ?? '').trim();
  const merchant = (searchParams.get('merchant') ?? '').trim();
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  if (!name && !merchant) {
    return NextResponse.json({ ok: false, error: 'name 또는 merchant 필요' });
  }

  const supabase = createServerSupabaseClient();

  // 최근 6개월 거래 중 매칭되는 것
  const sinceDate = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  let query = supabase
    .from('transactions')
    .select(
      'name, merchant_name, category_main, category_sub, payment_method_id, account_from_id, date',
    )
    .eq('household_id', householdId)
    .gte('date', sinceDate)
    .neq('type', 'income')
    .order('date', { ascending: false })
    .limit(200);

  if (name) {
    query = query.ilike('name', `%${name}%`);
  } else if (merchant) {
    query = query.ilike('merchant_name', `%${merchant}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: true, suggestion: null });
  }

  // 빈도 + 최신 가중 — 최근 거래 + 자주 등장 패턴 추출
  type Row = {
    name: string | null;
    merchant_name: string | null;
    category_main: string | null;
    category_sub: string | null;
    payment_method_id: string | null;
    account_from_id: string | null;
    date: string;
  };
  const rows = (data as Row[]).filter((r) => {
    if (name) return r.name && r.name.toLowerCase().includes(name.toLowerCase());
    return r.merchant_name && r.merchant_name.toLowerCase().includes(merchant.toLowerCase());
  });
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, suggestion: null });
  }

  // 각 필드별 최빈값
  const mode = (vals: (string | null | undefined)[]): string | null => {
    const counts: Record<string, number> = {};
    for (const v of vals) {
      if (!v) continue;
      counts[v] = (counts[v] ?? 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? null;
  };

  const suggestion = {
    name: name ? null : mode(rows.map((r) => r.name)),
    merchant_name: merchant ? null : mode(rows.map((r) => r.merchant_name)),
    category_main: mode(rows.map((r) => r.category_main)),
    category_sub: mode(rows.map((r) => r.category_sub)),
    payment_method_id: mode(rows.map((r) => r.payment_method_id)),
    account_from_id: mode(rows.map((r) => r.account_from_id)),
    frequency: rows.length,
    last_used: rows[0].date,
  };

  return NextResponse.json({ ok: true, suggestion });
}
