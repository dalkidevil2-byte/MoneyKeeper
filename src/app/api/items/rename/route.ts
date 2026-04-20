export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { updateNotionPage, type ItemForNotion } from '@/lib/notion';

/**
 * POST /api/items/rename
 * body: {
 *   from: { name: string, unit: string },  // 바꿀 대상 (현재 상태)
 *   to:   { name: string, unit: string },  // 새 값
 * }
 *
 * 동일 이름+단위의 모든 items를 새 name/unit으로 일괄 변경.
 * 영향 받은 거래들의 노션 본문도 재동기화.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const fromName: string = (body?.from?.name ?? '').trim();
    const fromUnit: string = (body?.from?.unit ?? '개').trim();
    const toName: string = (body?.to?.name ?? '').trim();
    const toUnit: string = (body?.to?.unit ?? '개').trim();

    if (!fromName) return NextResponse.json({ error: '원본 품목명 필요' }, { status: 400 });
    if (!toName) return NextResponse.json({ error: '새 품목명 필요' }, { status: 400 });

    // 해당 name+unit의 items 전체 조회 (영향 범위 확인 + 노션 동기화용 tx 목록 수집)
    const { data: affected, error: selErr } = await supabase
      .from('items')
      .select('id, transaction_id, unit')
      .eq('name', fromName);
    if (selErr) throw selErr;

    const rows = (affected ?? []).filter(
      (r) => (r.unit ?? '개') === fromUnit
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: '해당 이름/단위의 품목을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 업데이트
    const ids = rows.map((r) => r.id);
    const { error: upErr } = await supabase
      .from('items')
      .update({ name: toName, unit: toUnit })
      .in('id', ids);
    if (upErr) throw upErr;

    // 영향 받은 거래들의 노션 본문 재동기화 (fire-and-forget)
    const txIds = [...new Set(rows.map((r) => r.transaction_id))];
    (async () => {
      for (const txId of txIds) {
        try {
          const { data: tx } = await supabase
            .from('transactions')
            .select('*')
            .eq('id', txId)
            .single();
          if (!tx?.notion_page_id) continue;
          const { data: items } = await supabase
            .from('items')
            .select('name, quantity, price, unit, category_main, category_sub')
            .eq('transaction_id', txId);
          await updateNotionPage(
            tx.notion_page_id,
            tx as never,
            (items ?? []) as ItemForNotion[]
          );
        } catch (e) {
          console.warn('[rename notion sync]', txId, e);
        }
      }
    })().catch(() => {});

    return NextResponse.json({ updated: ids.length, transactions: txIds.length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '품목명 변경 실패';
    console.error('[POST /items/rename]', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
