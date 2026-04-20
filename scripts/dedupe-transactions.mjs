#!/usr/bin/env node
/**
 * 중복 거래 정리:
 *   (date, merchant_name, amount, 정렬된 items 구성) 완전 동일한 거래 그룹에서
 *   가장 오래된 created_at 1건만 남기고 나머지는 soft-cancel + 노션 archive.
 *
 * 실행:
 *   DRY-RUN:
 *     node --env-file=.env.local scripts/dedupe-transactions.mjs
 *   실제:
 *     node --env-file=.env.local scripts/dedupe-transactions.mjs --commit
 */

import { createClient } from '@supabase/supabase-js';
import { Client as NotionClient } from '@notionhq/client';

const COMMIT = process.argv.includes('--commit');
const MODE = COMMIT ? '🚀 COMMIT' : '🧪 DRY-RUN';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const notion = new NotionClient({ auth: process.env.NOTION_TOKEN });

(async () => {
  console.log(`${MODE} 중복 거래 정리 시작`);

  // 활성 거래 전체 로드
  const { data: txs, error: txErr } = await sb
    .from('transactions')
    .select('id, date, merchant_name, amount, status, created_at, notion_page_id')
    .neq('status', 'cancelled');
  if (txErr) {
    console.error('❌', txErr.message);
    process.exit(1);
  }

  // items 전부
  const { data: items } = await sb
    .from('items')
    .select('transaction_id, name, unit, price, quantity');
  const itemsByTx = {};
  for (const it of items ?? []) {
    (itemsByTx[it.transaction_id] ??= []).push(it);
  }

  function itemsKey(arr) {
    return (arr ?? [])
      .map((i) => `${i.name}|${i.unit ?? ''}|${i.price}|${i.quantity}`)
      .sort()
      .join('##');
  }

  // 그룹핑
  const groups = {};
  for (const t of txs) {
    const k = `${t.date}|${t.merchant_name ?? ''}|${t.amount}|${itemsKey(
      itemsByTx[t.id]
    )}`;
    (groups[k] ??= []).push(t);
  }

  const duplicateGroups = Object.entries(groups).filter(([, arr]) => arr.length > 1);
  console.log(`\n중복 그룹: ${duplicateGroups.length}개`);

  let deleteTxIds = [];
  for (const [key, arr] of duplicateGroups) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const keep = arr[0];
    const drop = arr.slice(1);
    const [date, merchant, amount] = key.split('|');
    console.log(`  ${date} ${merchant} ${Number(amount).toLocaleString()}원 — 총 ${arr.length}건 / 삭제 ${drop.length}건`);
    console.log(`    ↳ 유지: ${keep.id.slice(0, 8)} (${keep.created_at})`);
    for (const d of drop) {
      console.log(`    ↳ 삭제: ${d.id.slice(0, 8)} (${d.created_at}, 노션=${d.notion_page_id ? 'YES' : 'no'})`);
    }
    deleteTxIds.push(...drop);
  }

  if (deleteTxIds.length === 0) {
    console.log('\n✅ 중복 없음');
    return;
  }

  console.log(`\n총 삭제 대상: ${deleteTxIds.length}건`);
  if (!COMMIT) {
    console.log('🧪 DRY-RUN — --commit 추가하면 적용.');
    return;
  }

  console.log('\n⬇️  진행 중...');
  for (const t of deleteTxIds) {
    // 1) 거래 soft-cancel
    await sb.from('transactions').update({ status: 'cancelled' }).eq('id', t.id);
    console.log(`  ✓ cancel ${t.id.slice(0, 8)}`);

    // 2) 노션 archive
    if (t.notion_page_id && process.env.NOTION_TOKEN) {
      try {
        await notion.pages.update({ page_id: t.notion_page_id, archived: true });
        console.log(`  ✓ notion archive ${t.notion_page_id.slice(0, 8)}`);
      } catch (e) {
        console.log(`  ⚠ notion fail: ${e.message}`);
      }
    }

    // 3) items 완전 삭제 (CASCADE와 별개로 확실히)
    await sb.from('items').delete().eq('transaction_id', t.id);
  }

  console.log(`\n✅ ${deleteTxIds.length}건 정리 완료`);
})().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
