#!/usr/bin/env node
/**
 * 시드머니 디폴트 채우기
 * - 각 stock_accounts의 현재 보유 원금(qty × 평단)을 DEPOSIT 1건으로 추가
 * - 이미 stock_cash_flows 레코드가 있는 계좌는 건드리지 않음 (중복 방지)
 *
 * 실행:
 *   DRY-RUN:
 *     node --env-file=.env.local scripts/seed-cashflow-defaults.mjs
 *   실제:
 *     node --env-file=.env.local scripts/seed-cashflow-defaults.mjs --commit
 */

import { createClient } from '@supabase/supabase-js';

const COMMIT = process.argv.includes('--commit');
const MODE = COMMIT ? '🚀 COMMIT' : '🧪 DRY-RUN';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 가중평균 평단 기반 보유 계산 (TS 라이브러리 stock-holdings.ts와 동일 로직)
function computeHoldings(txs) {
  const sorted = txs
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  const map = {};
  for (const tx of sorted) {
    const key = `${tx.account_id}-${tx.ticker}`;
    if (!map[key]) {
      map[key] = { account_id: tx.account_id, ticker: tx.ticker, qty: 0, avgPrice: 0 };
    }
    const h = map[key];
    if (tx.type === 'BUY') {
      const newQty = h.qty + Number(tx.quantity);
      h.avgPrice =
        newQty > 0
          ? (h.qty * h.avgPrice + Number(tx.quantity) * Number(tx.price)) / newQty
          : 0;
      h.qty = newQty;
    } else {
      h.qty = Math.max(0, h.qty - Number(tx.quantity));
      if (h.qty === 0) h.avgPrice = 0;
    }
  }
  return Object.values(map).filter((h) => h.qty > 0.00001);
}

(async () => {
  console.log(`${MODE} 시드머니 디폴트 채우기 시작\n`);

  // 1) 모든 계좌
  const { data: accounts, error: accErr } = await sb
    .from('stock_accounts')
    .select('id, broker_name, owner_id, owner:stock_owners!owner_id(name)');
  if (accErr) {
    console.error('❌ accounts:', accErr.message);
    process.exit(1);
  }
  console.log(`📦 계좌 ${accounts.length}개 발견`);

  // 2) 모든 거래
  const { data: allTxs, error: txErr } = await sb
    .from('stock_transactions')
    .select('id, account_id, ticker, type, date, quantity, price, created_at');
  if (txErr) {
    console.error('❌ transactions:', txErr.message);
    process.exit(1);
  }
  console.log(`📈 거래 ${allTxs.length}건 로드`);

  // 3) 이미 cash_flows 있는 계좌
  const { data: existingFlows } = await sb
    .from('stock_cash_flows')
    .select('account_id');
  const skipAccountIds = new Set((existingFlows ?? []).map((f) => f.account_id));
  if (skipAccountIds.size > 0) {
    console.log(`⏭️  이미 입출금 내역 있는 계좌: ${skipAccountIds.size}개 → 건드리지 않음`);
  }

  console.log('');

  // 4) 계좌별 invested 계산 + 시드머니 후보
  const today = new Date().toISOString().split('T')[0];
  const inserts = [];
  for (const acc of accounts) {
    const ownerName = acc.owner?.name ?? '?';
    const label = `${ownerName} · ${acc.broker_name}`;

    if (skipAccountIds.has(acc.id)) {
      console.log(`  ⏭️  ${label} (이미 입출금 있음, skip)`);
      continue;
    }

    const accTxs = allTxs.filter((t) => t.account_id === acc.id);
    const holdings = computeHoldings(accTxs);
    const invested = holdings.reduce((s, h) => s + h.qty * h.avgPrice, 0);
    const rounded = Math.round(invested);

    if (rounded <= 0) {
      console.log(`  ⏭️  ${label}: 보유 원금 0 → skip`);
      continue;
    }

    console.log(`  ✅ ${label}: ${rounded.toLocaleString('ko-KR')}원 입금 예정`);
    inserts.push({
      account_id: acc.id,
      date: today,
      type: 'DEPOSIT',
      amount: rounded,
      memo: '초기 시드머니 (현재 보유 원금 자동 추정)',
    });
  }

  console.log(`\n📝 입금 ${inserts.length}건 예정`);

  if (!COMMIT) {
    console.log('\n🧪 DRY-RUN — 실제로 쓰지 않음. --commit 추가하면 적용.');
    return;
  }

  if (inserts.length === 0) {
    console.log('🟢 추가할 항목 없음. 종료.');
    return;
  }

  console.log('\n⬆️  업서트 중...');
  const { error: insErr } = await sb.from('stock_cash_flows').insert(inserts);
  if (insErr) {
    console.error('❌', insErr.message);
    process.exit(1);
  }

  // 검증
  const { count } = await sb
    .from('stock_cash_flows')
    .select('*', { count: 'exact', head: true });
  console.log(`✅ 완료. stock_cash_flows 총 ${count}건`);
})().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
