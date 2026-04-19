#!/usr/bin/env node
/**
 * StockWeb → MoneyKeeper(My Assistant) 데이터 이관 스크립트
 *
 * 실행 (DRY-RUN: 아무것도 쓰지 않음):
 *   node --env-file=.env.local scripts/migrate-stockweb.mjs
 *
 * 실행 (실제 이관):
 *   node --env-file=.env.local scripts/migrate-stockweb.mjs --commit
 *
 * 전제:
 *   1. stock-schema.sql이 MoneyKeeper Supabase에 이미 적용되어 있어야 함
 *   2. NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID에 해당하는 households 레코드가 존재해야 함
 *   3. inspect-stockweb.mjs 먼저 돌려서 데이터 확인 완료 상태여야 함
 *
 * 동작:
 *   - StockWeb Supabase의 user_data 전체 읽기
 *   - JSONB 파싱 → 정규화된 stock_* 테이블로 이관
 *   - ID 매핑 (source INT id → new UUID)
 *   - 로컬 asset_history.json도 stock_asset_history로 이관
 *   - 중복 방지: 실행 전 stock_* 테이블이 비어있는지 확인
 *   - 이관 완료 후 각 테이블별 레코드 수 리포트
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const COMMIT = process.argv.includes('--commit');
const MODE = COMMIT ? '🚀 COMMIT' : '🧪 DRY-RUN';

// ─── 환경변수 확인 ──────────────────────────────────────────────
const SOURCE_URL        = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY        = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY        = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HOUSEHOLD_ID      = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;

const missing = [];
if (!SOURCE_URL)   missing.push('SOURCE_SUPABASE_URL');
if (!SOURCE_KEY)   missing.push('SOURCE_SUPABASE_SERVICE_ROLE_KEY');
if (!TARGET_URL)   missing.push('NEXT_PUBLIC_SUPABASE_URL');
if (!TARGET_KEY)   missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!HOUSEHOLD_ID) missing.push('NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID');
if (missing.length) {
  console.error(`❌ 환경변수 누락: ${missing.join(', ')}`);
  console.error('   실행 시 반드시 --env-file=.env.local 플래그를 쓰세요.');
  process.exit(1);
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`📦 StockWeb → My Assistant 이관 [${MODE}]`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   SOURCE: ${SOURCE_URL}`);
console.log(`   TARGET: ${TARGET_URL}`);
console.log(`   HOUSEHOLD_ID: ${HOUSEHOLD_ID}`);
if (!COMMIT) {
  console.log(`\n   ⚠️  DRY-RUN 모드입니다. 실제 insert는 실행되지 않습니다.`);
  console.log(`      실제 이관하려면 --commit 플래그를 추가하세요.`);
}
console.log('');

const source = createClient(SOURCE_URL, SOURCE_KEY, { auth: { persistSession: false } });
const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });

// ─── 0. 사전 검사 ───────────────────────────────────────────────
console.log('🔍 1/6 사전 검사');

// households 존재 확인
{
  const { data, error } = await target.from('households').select('id').eq('id', HOUSEHOLD_ID).maybeSingle();
  if (error) { console.error('   ❌ households 확인 실패:', error.message); process.exit(1); }
  if (!data)  { console.error(`   ❌ households에 ${HOUSEHOLD_ID} 없음. schema.sql 시드 데이터 먼저 적용하세요.`); process.exit(1); }
  console.log(`   ✓ households 확인됨`);
}

// stock_* 테이블 존재 + 비어있는지 확인
const stockTables = [
  'stock_owners', 'stock_accounts', 'stock_transactions',
  'stock_watchlist', 'stock_targets', 'stock_memos',
  'stock_journals', 'stock_asset_history',
];
for (const table of stockTables) {
  const { count, error } = await target.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`   ❌ ${table} 조회 실패: ${error.message}`);
    console.error(`      → stock-schema.sql이 적용되었는지 확인하세요.`);
    process.exit(1);
  }
  if (count && count > 0) {
    console.error(`   ❌ ${table}에 이미 ${count}개 레코드 있음. 이관 중단 (중복 방지).`);
    console.error(`      초기화하려면: DELETE FROM ${table};`);
    process.exit(1);
  }
}
console.log(`   ✓ stock_* 테이블 8개 모두 비어있음`);

// ─── 1. 소스 데이터 로드 ────────────────────────────────────────
console.log('\n📥 2/6 소스 데이터 로드');
const { data: rows, error: srcErr } = await source.from('user_data').select('*');
if (srcErr || !rows?.length) {
  console.error('   ❌ 소스 데이터 없음:', srcErr?.message);
  process.exit(1);
}
console.log(`   ✓ user_data ${rows.length}개 row 로드됨`);

// 여러 user 지원: 가장 최근 updated_at row 선택 (일반적으론 1건)
const row = rows.sort((a, b) =>
  (b.updated_at || '').localeCompare(a.updated_at || '')
)[0];
console.log(`   ✓ 사용할 row: user_id=${row.user_id}, updated_at=${row.updated_at}`);
if (rows.length > 1) {
  console.log(`   ⚠️  다른 ${rows.length - 1}개 row는 무시됨. 여러 계정 데이터 병합이 필요하면 스크립트 수정 필요.`);
}

const srcOwners       = row.owners       || [];
const srcAccounts     = row.accounts     || [];
const srcTransactions = row.transactions || [];
const srcWatchlist    = row.watchlist    || [];
const srcTargets      = row.targets      || {};
const srcMemos        = row.memos        || {};
const srcJournals     = row.journals     || {};

// ─── 2. owners 이관 (+ id 매핑) ─────────────────────────────────
console.log('\n👤 3/6 owners 이관');
const ownerIdMap = new Map(); // oldInt → newUUID

if (srcOwners.length > 0) {
  const ownerRows = srcOwners.map(o => ({
    household_id: HOUSEHOLD_ID,
    source_id: o.id,
    name: o.name || '이름없음',
    created_at: o.createdAt || new Date().toISOString(),
  }));

  if (COMMIT) {
    const { data, error } = await target.from('stock_owners').insert(ownerRows).select('id, source_id');
    if (error) { console.error('   ❌', error.message); process.exit(1); }
    data.forEach(o => ownerIdMap.set(o.source_id, o.id));
  } else {
    // dry-run에선 가짜 UUID 할당 (매핑 로직 검증용)
    srcOwners.forEach(o => ownerIdMap.set(o.id, `dry-owner-${o.id}`));
  }
  console.log(`   ✓ ${srcOwners.length}명 ${COMMIT ? 'insert 완료' : '(dry-run 매핑 시뮬레이션)'}`);
} else {
  console.log(`   ⊘ 스킵 (소스에 owners 없음)`);
}

// ─── 3. accounts 이관 (ownerId 매핑 적용) ────────────────────────
console.log('\n🏦 4/6 accounts 이관');
const accountIdMap = new Map();

if (srcAccounts.length > 0) {
  const orphans = srcAccounts.filter(a => !ownerIdMap.has(a.ownerId));
  if (orphans.length > 0) {
    console.error(`   ❌ owner 매핑 실패한 계좌 ${orphans.length}개:`, orphans.map(o => o.id));
    process.exit(1);
  }

  const accountRows = srcAccounts.map(a => ({
    owner_id: ownerIdMap.get(a.ownerId),
    source_id: a.id,
    broker_name: a.brokerName || '',
    account_number: a.accountNumber || '',
    created_at: a.createdAt || new Date().toISOString(),
  }));

  if (COMMIT) {
    const { data, error } = await target.from('stock_accounts').insert(accountRows).select('id, source_id');
    if (error) { console.error('   ❌', error.message); process.exit(1); }
    data.forEach(a => accountIdMap.set(a.source_id, a.id));
  } else {
    srcAccounts.forEach(a => accountIdMap.set(a.id, `dry-account-${a.id}`));
  }
  console.log(`   ✓ ${srcAccounts.length}개 ${COMMIT ? 'insert 완료' : '(dry-run 매핑 시뮬레이션)'}`);
} else {
  console.log(`   ⊘ 스킵`);
}

// ─── 4. transactions 이관 (accountId 매핑 적용) ──────────────────
console.log('\n💹 5/6 transactions 이관');
if (srcTransactions.length > 0) {
  const orphans = srcTransactions.filter(t => !accountIdMap.has(t.accountId));
  if (orphans.length > 0) {
    console.error(`   ❌ account 매핑 실패한 거래 ${orphans.length}건 (무시)`);
  }

  const txRows = srcTransactions
    .filter(t => accountIdMap.has(t.accountId))
    .filter(t => t.ticker && t.date && t.quantity > 0 && t.price >= 0)
    .map(t => ({
      account_id: accountIdMap.get(t.accountId),
      source_id: t.id,
      ticker: t.ticker,
      company_name: t.companyName || '',
      type: (t.type || 'BUY').toUpperCase(),
      date: t.date,
      quantity: t.quantity,
      price: t.price,
      memo: t.memo || '',
      created_at: t.createdAt || new Date().toISOString(),
    }));

  if (COMMIT) {
    // 배치 insert (1000건씩)
    for (let i = 0; i < txRows.length; i += 500) {
      const batch = txRows.slice(i, i + 500);
      const { error } = await target.from('stock_transactions').insert(batch);
      if (error) { console.error('   ❌', error.message); process.exit(1); }
    }
  }
  console.log(`   ✓ ${txRows.length}건 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
  if (srcTransactions.length !== txRows.length) {
    console.log(`   ⚠️  ${srcTransactions.length - txRows.length}건은 유효하지 않아 제외됨`);
  }
} else {
  console.log(`   ⊘ 스킵`);
}

// ─── 5. watchlist / targets / memos / journals / asset_history ──
console.log('\n📚 6/6 보조 데이터 이관');

// watchlist
if (srcWatchlist.length > 0) {
  const rows = srcWatchlist
    .filter(w => w.ticker)
    .map(w => ({
      household_id: HOUSEHOLD_ID,
      ticker: w.ticker,
      name: w.name || '',
      buy_price: w.buyPrice ?? null,
      profit_pct: w.profitPct ?? null,
      stop_loss_pct: w.stopLossPct ?? null,
    }));
  if (COMMIT && rows.length) {
    const { error } = await target.from('stock_watchlist').insert(rows);
    if (error) { console.error('   ❌ watchlist:', error.message); process.exit(1); }
  }
  console.log(`   ✓ watchlist: ${rows.length}종목 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
}

// targets: {ticker: pct}
const targetRows = Object.entries(srcTargets)
  .filter(([t, pct]) => t && typeof pct === 'number')
  .map(([ticker, pct]) => ({
    household_id: HOUSEHOLD_ID,
    ticker,
    target_pct: pct,
  }));
if (targetRows.length > 0) {
  if (COMMIT) {
    const { error } = await target.from('stock_targets').insert(targetRows);
    if (error) { console.error('   ❌ targets:', error.message); process.exit(1); }
  }
  console.log(`   ✓ targets: ${targetRows.length}종목 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
}

// memos: {ticker: {content, updatedAt}} or {ticker: "content"}
const memoRows = Object.entries(srcMemos)
  .map(([ticker, m]) => {
    const content = typeof m === 'string' ? m : (m?.content || '');
    return content.trim() ? {
      household_id: HOUSEHOLD_ID,
      ticker,
      content,
      updated_at: (typeof m === 'object' && m?.updatedAt) || new Date().toISOString(),
    } : null;
  })
  .filter(Boolean);
if (memoRows.length > 0) {
  if (COMMIT) {
    const { error } = await target.from('stock_memos').insert(memoRows);
    if (error) { console.error('   ❌ memos:', error.message); process.exit(1); }
  }
  console.log(`   ✓ memos: ${memoRows.length}종목 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
}

// journals: {date: content}
const journalRows = Object.entries(srcJournals)
  .filter(([date, content]) => date && typeof content === 'string' && content.trim())
  .map(([date, content]) => ({
    household_id: HOUSEHOLD_ID,
    entry_date: date,
    content,
  }));
if (journalRows.length > 0) {
  if (COMMIT) {
    const { error } = await target.from('stock_journals').insert(journalRows);
    if (error) { console.error('   ❌ journals:', error.message); process.exit(1); }
  }
  console.log(`   ✓ journals: ${journalRows.length}개 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
}

// asset_history (로컬 파일)
const ahPath = resolve(PROJECT_ROOT, '../../StockWeb/data/asset_history.json');
if (existsSync(ahPath)) {
  const ah = JSON.parse(readFileSync(ahPath, 'utf-8'));
  const ahRows = ah
    .filter(h => h.date && typeof h.totalValue === 'number')
    .map(h => ({
      household_id: HOUSEHOLD_ID,
      date: h.date,
      total_value: Math.round(h.totalValue),
    }));
  if (ahRows.length > 0) {
    if (COMMIT) {
      const { error } = await target.from('stock_asset_history').insert(ahRows);
      if (error) { console.error('   ❌ asset_history:', error.message); process.exit(1); }
    }
    console.log(`   ✓ asset_history: ${ahRows.length}건 ${COMMIT ? 'insert 완료' : '(dry-run)'}`);
  }
}

// ─── 완료 ────────────────────────────────────────────────────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
if (COMMIT) {
  console.log(`✅ 이관 완료.\n`);
  console.log(`   확인 쿼리 (MoneyKeeper Supabase SQL Editor에서):`);
  console.log(`   SELECT COUNT(*) FROM stock_owners;`);
  console.log(`   SELECT COUNT(*) FROM stock_accounts;`);
  console.log(`   SELECT COUNT(*) FROM stock_transactions;`);
  console.log(`   SELECT COUNT(*) FROM stock_watchlist;`);
  console.log(`\n   문제 없으면 다음 단계:`);
  console.log(`   1. .env.local에서 SOURCE_* 환경변수 2개 삭제`);
  console.log(`   2. StockWeb Supabase 대시보드 → Service Role Key Rotate`);
  console.log(`   3. 확인 후 StockWeb Supabase 프로젝트 삭제`);
} else {
  console.log(`🧪 DRY-RUN 완료. 숫자가 예상과 맞으면 --commit으로 재실행하세요:`);
  console.log(`\n   node --env-file=.env.local scripts/migrate-stockweb.mjs --commit`);
}
