import { createServerSupabaseClient } from '@/lib/supabase';
import { createNotionPage, type ItemForNotion } from '@/lib/notion';

type Supabase = ReturnType<typeof createServerSupabaseClient>;

// ─────────────────────────────────────────
// 거래 하나를 Notion 에 올리고 sync_status 를 갱신한다.
//
// Inbox 는 'sync_status 가 pending/failed 인 거래' 를 보여준다.
// 즉 동기화가 되어야 Inbox 에서 사라진다. 거래를 만들거나 확인한 시점에
// 이 함수를 부르지 않으면, 확인을 눌러도 항목이 계속 남아 있게 된다.
//
// 예외를 던지지 않는다 — 거래 저장 자체는 이미 끝난 뒤이고,
// 동기화 실패는 sync_status='failed' 로 남겨 나중에 다시 시도하면 된다.
// ─────────────────────────────────────────
export async function syncTransactionToNotion(
  supabase: Supabase,
  transactionId: string,
): Promise<'synced' | 'failed' | 'not_found'> {
  const { data: tx, error } = await supabase
    .from('transactions')
    .select(
      `*, member:members!member_id(id, name, color), payment_method:payment_methods(id, name, type)`,
    )
    .eq('id', transactionId)
    .single();

  if (error || !tx) return 'not_found';

  try {
    // 세부 품목이 있으면 함께 올린다 (생성 직후엔 없을 수 있음)
    const { data: items } = await supabase
      .from('items')
      .select('name, quantity, price, unit, category_main, category_sub')
      .eq('transaction_id', transactionId);

    const notionPageId = await createNotionPage(tx, (items ?? []) as ItemForNotion[]);

    if (!notionPageId) {
      await supabase
        .from('transactions')
        .update({ sync_status: 'failed' })
        .eq('id', transactionId);
      return 'failed';
    }

    await supabase
      .from('transactions')
      .update({
        notion_page_id: notionPageId,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', transactionId);
    return 'synced';
  } catch (e) {
    console.warn('[notion sync]', transactionId, e);
    await supabase
      .from('transactions')
      .update({ sync_status: 'failed' })
      .eq('id', transactionId);
    return 'failed';
  }
}
