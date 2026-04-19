#!/usr/bin/env node
/**
 * SQL 마이그레이션 실행기 (Supabase REST 직접 호출 — pg 의존성 없음)
 *
 * 사용:
 *   node --env-file=.env.local scripts/run-migration.mjs <마이그레이션-파일-이름>
 *   예: node --env-file=.env.local scripts/run-migration.mjs 002-drop-watchlist-journal-add-cashflow-paper.sql
 *
 * Supabase는 Service Role 키로 인증하면 RPC `exec` 같은 직접 SQL 실행은 노출하지 않으므로,
 * 이 스크립트는 SQL 파일을 ;로 분할해 각 statement를 PostgREST 메타 RPC로 실행하는 게 아니라,
 * **수동 실행 안내 + 검증**만 수행합니다.
 *
 * 실제 적용:
 *   1. supabase 대시보드 → SQL Editor 열기
 *   2. 이 스크립트가 출력하는 SQL을 복사해 붙여넣고 RUN
 *   3. 다시 이 스크립트를 실행해 적용 여부 검증
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const arg = process.argv[2];
if (!arg) {
  console.error('❌ 마이그레이션 파일 이름을 인자로 주세요');
  console.error('   예: scripts/run-migration.mjs 002-drop-watchlist-journal-add-cashflow-paper.sql');
  process.exit(1);
}

const sqlPath = resolve(PROJECT_ROOT, 'src/db/migrations', arg);
const sql = readFileSync(sqlPath, 'utf8');
console.log(`📂 마이그레이션 파일: ${sqlPath}\n`);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 적용 여부 검증
async function verify() {
  console.log('🔍 적용 여부 검증 중...\n');
  const checks = [
    { table: 'stock_watchlist', expectExist: false },
    { table: 'stock_journals',  expectExist: false },
    { table: 'stock_cash_flows', expectExist: true },
    { table: 'paper_owners',     expectExist: true },
    { table: 'paper_accounts',   expectExist: true },
    { table: 'paper_transactions', expectExist: true },
    { table: 'paper_cash_flows',   expectExist: true },
  ];

  let pass = 0;
  let fail = 0;
  for (const c of checks) {
    const { error } = await supabase.from(c.table).select('*', { count: 'exact', head: true });
    const exists = !error || !/does not exist|relation .* does not exist/i.test(error.message);
    const ok = exists === c.expectExist;
    console.log(
      `  ${ok ? '✅' : '❌'} ${c.table}: ${
        exists ? '존재함' : '없음'
      } (기대: ${c.expectExist ? '존재' : '없음'})`
    );
    if (ok) pass++;
    else fail++;
  }
  console.log(`\n${pass}개 통과, ${fail}개 실패`);
  return fail === 0;
}

(async () => {
  const allApplied = await verify();
  if (allApplied) {
    console.log('\n✅ 이미 모두 적용되어 있습니다.');
    return;
  }

  console.log('\n────────────────────────────────────────────────────');
  console.log('📋 아래 SQL을 Supabase 대시보드 SQL Editor에서 실행하세요:');
  console.log('   https://supabase.com/dashboard/project/_/sql/new');
  console.log('────────────────────────────────────────────────────\n');
  console.log(sql);
  console.log('\n────────────────────────────────────────────────────');
  console.log(`실행 후 다시 이 스크립트를 돌려서 검증:\n  node --env-file=.env.local scripts/run-migration.mjs ${basename(sqlPath)}`);
})();
