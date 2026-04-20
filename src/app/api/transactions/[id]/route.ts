export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  updateNotionPage,
  archiveNotionPage,
  createNotionPage,
  type ItemForNotion,
} from '@/lib/notion';

// PATCH /api/transactions/[id] - 거래 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id } = await params;

  const targetIds: string[] = Array.isArray(body.target_member_ids)
    ? body.target_member_ids.filter(Boolean)
    : body.target_member_id
      ? [body.target_member_id]
      : [];

  const { data, error } = await supabase
    .from('transactions')
    .update({
      date: body.date,
      type: body.type,
      amount: body.amount,
      name: body.name ?? '',
      merchant_name: body.merchant_name ?? '',
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      payment_method_id: body.payment_method_id ?? null,
      account_from_id: body.account_from_id ?? null,
      account_to_id: body.account_to_id ?? null,
      member_id: body.member_id ?? null,
      target_member_id: targetIds[0] ?? null,
      target_member_ids: targetIds,
      receipt_url: body.receipt_url ?? '',
      memo: body.memo ?? '',
    })
    .eq('id', id)
    .select(`
      *,
      member:members!member_id(id, name, color),
      target_member:members!target_member_id(id, name, color),
      account_from:accounts!account_from_id(id, name, type),
      account_to:accounts!account_to_id(id, name, type),
      payment_method:payment_methods(id, name, type)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── 노션 동기화 (fire-and-forget) ──
  syncNotion(supabase, data).catch((e) =>
    console.error('[Notion PATCH sync]', e)
  );

  return NextResponse.json({ transaction: data });
}

// DELETE /api/transactions/[id] - 거래 삭제 (소프트 삭제)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const { id } = await params;

  // 삭제 전 tx 조회 (notion_page_id + 제목 갱신용)
  const { data: tx } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .single();

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── 노션 아카이브 ──
  if (tx?.notion_page_id) {
    archiveNotionPage(tx.notion_page_id, tx).catch((e) =>
      console.error('[Notion archive]', e)
    );
  }

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────
// 수정 시 노션 동기화 헬퍼
// - 기존에 notion_page_id 있으면 업데이트
// - 없으면 새로 생성 (이전에 수동 sync 누락된 거래를 자동 복구)
// ─────────────────────────────────────────
async function syncNotion(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tx: { id: string; notion_page_id?: string | null } & Record<string, unknown>
) {
  try {
    const { data: items } = await supabase
      .from('items')
      .select('name, quantity, price, unit, category_main, category_sub')
      .eq('transaction_id', tx.id);
    const itemList = (items ?? []) as ItemForNotion[];

    if (tx.notion_page_id) {
      const ok = await updateNotionPage(tx.notion_page_id, tx as never, itemList);
      await supabase
        .from('transactions')
        .update({
          sync_status: ok ? 'synced' : 'failed',
          last_synced_at: ok ? new Date().toISOString() : undefined,
        })
        .eq('id', tx.id);
    } else {
      const pageId = await createNotionPage(tx as never, itemList);
      await supabase
        .from('transactions')
        .update({
          notion_page_id: pageId ?? '',
          sync_status: pageId ? 'synced' : 'failed',
          last_synced_at: pageId ? new Date().toISOString() : undefined,
        })
        .eq('id', tx.id);
    }
  } catch (err) {
    console.error('[syncNotion]', err);
    await supabase
      .from('transactions')
      .update({ sync_status: 'failed' })
      .eq('id', tx.id);
  }
}
