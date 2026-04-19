#!/usr/bin/env node
/**
 * StockWeb Supabase 데이터 검증 + 백업 스크립트 (읽기 전용)
 *
 * 실행:
 *   node --env-file=.env.local scripts/inspect-stockweb.mjs
 *
 * 동작:
 *   1. SOURCE_SUPABASE_URL의 user_data 테이블 전체 조회
 *   2. 각 row의 JSONB 컬럼별 레코드 수 및 샘플 출력
 *   3. 로컬 asset_history.json도 함께 확인
 *   4. 전체 덤프를 data-backup/stockweb-[timestamp].json 에 저장 (복구용)
 *
 * 이 스크립트는 아무것도 쓰지 않음. 안심하고 여러 번 실행 가능.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ─── 환경변수 확인 ──────────────────────────────────────────────
const SOURCE_URL = process.env.SOURCE_SUPABASE_URL;
const SOURCE_KEY = process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error('❌ 환경변수 누락: SOURCE_SUPABASE_URL, SOURCE_SUPABASE_SERVICE_ROLE_KEY');
  console.error('   .env.local 파일에 설정됐는지 확인하세요.');
  console.error('   실행 시 반드시 --env-file=.env.local 플래그를 쓰세요.');
  process.exit(1);
}

console.log('🔍 StockWeb Supabase 검증 시작');
console.log(`   Source: ${SOURCE_URL}\n`);

const supa = createClient(SOURCE_URL, SOURCE_KEY, {
  auth: { persistSession: false },
});

// ─── 1. user_data 전체 조회 ─────────────────────────────────────
const { data: rows, error } = await supa.from('user_data').select('*');
if (error) {
  console.error('❌ user_data 조회 실패:', error.message);
  process.exit(1);
}

if (!rows || rows.length === 0) {
  console.error('⚠️  user_data 테이블에 레코드가 없습니다.');
  process.exit(1);
}

console.log(`✅ user_data 레코드: ${rows.length}건\n`);

// ─── 2. 각 row 분석 ──────────────────────────────────────────────
rows.forEach((row, idx) => {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📦 Row ${idx + 1}: user_id=${row.user_id}`);
  console.log(`   updated_at: ${row.updated_at}\n`);

  const owners       = row.owners       || [];
  const accounts     = row.accounts     || [];
  const transactions = row.transactions || [];
  const watchlist    = row.watchlist    || [];
  const targets      = row.targets      || {};
  const memos        = row.memos        || {};
  const journals     = row.journals     || {};

  // 카운트
  console.log(`   📊 레코드 수:`);
  console.log(`      owners:       ${owners.length}명`);
  console.log(`      accounts:     ${accounts.length}개`);
  console.log(`      transactions: ${transactions.length}건`);
  console.log(`      watchlist:    ${watchlist.length}종목`);
  console.log(`      targets:      ${Object.keys(targets).length}종목`);
  console.log(`      memos:        ${Object.keys(memos).length}종목`);
  console.log(`      journals:     ${Object.keys(journals).length}개 날짜`);

  // 샘플 데이터
  if (owners.length > 0) {
    console.log(`\n   👤 소유자 목록:`);
    owners.forEach(o => console.log(`      - [${o.id}] ${o.name}`));
  }

  if (accounts.length > 0) {
    console.log(`\n   🏦 계좌 목록:`);
    accounts.forEach(a => console.log(`      - [${a.id}] owner=${a.ownerId} ${a.brokerName} ${a.accountNumber || ''}`));
  }

  if (transactions.length > 0) {
    // 거래 요약: 날짜 범위, 타입별 카운트
    const dates = transactions.map(t => t.date).filter(Boolean).sort();
    const byType = transactions.reduce((acc, t) => {
      acc[t.type] = (acc[t.type] || 0) + 1;
      return acc;
    }, {});
    const tickers = [...new Set(transactions.map(t => t.ticker))];
    console.log(`\n   💹 거래 요약:`);
    console.log(`      기간: ${dates[0]} ~ ${dates[dates.length - 1]}`);
    console.log(`      타입: ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`      종목: ${tickers.length}개 (${tickers.slice(0, 5).join(', ')}${tickers.length > 5 ? ' ...' : ''})`);
    // 샘플 1건
    console.log(`      샘플: ${JSON.stringify(transactions[0])}`);
  }

  if (watchlist.length > 0) {
    console.log(`\n   ⭐ 관심종목 샘플:`);
    watchlist.slice(0, 3).forEach(w => {
      console.log(`      - ${w.ticker} (${w.name}) buyPrice=${w.buyPrice} profitPct=${w.profitPct}% stopLoss=${w.stopLossPct}%`);
    });
  }

  if (Object.keys(targets).length > 0) {
    const sample = Object.entries(targets).slice(0, 3);
    console.log(`\n   🎯 목표수익률 샘플: ${sample.map(([k, v]) => `${k}=${v}%`).join(', ')}`);
  }

  if (Object.keys(memos).length > 0) {
    const sample = Object.entries(memos).slice(0, 2);
    console.log(`\n   📝 메모 샘플:`);
    sample.forEach(([ticker, m]) => {
      const content = typeof m === 'string' ? m : (m?.content || JSON.stringify(m));
      console.log(`      - ${ticker}: "${String(content).slice(0, 50)}${content.length > 50 ? '...' : ''}"`);
    });
  }

  if (Object.keys(journals).length > 0) {
    const sample = Object.entries(journals).slice(0, 2);
    console.log(`\n   📔 저널 샘플:`);
    sample.forEach(([date, content]) => {
      const c = typeof content === 'string' ? content : JSON.stringify(content);
      console.log(`      - ${date}: "${c.slice(0, 50)}${c.length > 50 ? '...' : ''}"`);
    });
  }

  console.log('');
});

// ─── 3. 로컬 asset_history.json 확인 ─────────────────────────────
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
const assetHistoryPath = resolve(PROJECT_ROOT, '../../StockWeb/data/asset_history.json');
if (existsSync(assetHistoryPath)) {
  const ah = JSON.parse(readFileSync(assetHistoryPath, 'utf-8'));
  console.log(`\n📈 로컬 asset_history.json: ${ah.length}건`);
  ah.forEach(h => console.log(`   ${h.date}: ₩${Number(h.totalValue).toLocaleString()}`));
} else {
  console.log(`\n⚠️  asset_history.json 파일 없음: ${assetHistoryPath}`);
}

// ─── 4. 백업 저장 ───────────────────────────────────────────────
const backupDir = resolve(PROJECT_ROOT, 'data-backup');
if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = resolve(backupDir, `stockweb-${ts}.json`);
writeFileSync(backupFile, JSON.stringify({
  source_url: SOURCE_URL,
  snapshot_at: new Date().toISOString(),
  user_data: rows,
  asset_history_local: existsSync(assetHistoryPath)
    ? JSON.parse(readFileSync(assetHistoryPath, 'utf-8'))
    : [],
}, null, 2), 'utf-8');

console.log(`\n💾 백업 저장: ${backupFile}`);
console.log(`\n✅ 검증 완료. 위 숫자들이 예상과 맞으면 다음 단계(이관 실행)로 진행하세요.`);
