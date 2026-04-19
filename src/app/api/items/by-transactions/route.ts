export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// POST /api/items/by-transactions { transaction_ids: string[] }
// 통계 페이지에서 거래 묶음의 세부 품목을 일괄 조회.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.transaction_ids) ? body.transaction_ids : [];
    if (ids.length === 0) return NextResponse.json({ items: [] });

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from('items')
      .select('id, transaction_id, name, price, quantity, category_main, category_sub')
      .in('transaction_id', ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'items 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
