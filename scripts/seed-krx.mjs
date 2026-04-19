#!/usr/bin/env node
/**
 * KRX 종목 목록 → stock_krx_stocks 테이블 시드
 *
 * 소스 우선순위:
 *   1. StockWeb/data/krx_stocks.json 파일 (기본, 빠름)
 *   2. --fetch 플래그 지정 시 KIND(한국거래소 공시시스템)에서 직접 다운로드
 *
 * 실행:
 *   DRY-RUN:
 *     node --env-file=.env.local scripts/seed-krx.mjs
 *   실제 업서트:
 *     node --env-file=.env.local scripts/seed-krx.mjs --commit
 *   KIND에서 새로 받기 (iconv-lite 필요):
 *     node --env-file=.env.local scripts/seed-krx.mjs --commit --fetch
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const COMMIT = process.argv.includes('--commit');
const FETCH = process.argv.includes('--fetch');
const MODE = COMMIT ? '🚀 COMMIT' : '🧪 DRY-RUN';

const TARGET_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const TARGET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!TARGET_URL || !TARGET_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  process.exit(1);
}

const supabase = createClient(TARGET_URL, TARGET_KEY);

// ─── 소스 1: StockWeb/data/krx_stocks.json ───────────────────────
function loadFromStockWebJson() {
  const candidates = [
    resolve(PROJECT_ROOT, '..', '..', 'StockWeb', 'data', 'krx_stocks.json'),
    resolve(PROJECT_ROOT, '..', 'StockWeb', 'data', 'krx_stocks.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      console.log(`📂 소스 파일: ${p}`);
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      return raw.stocks ?? [];
    }
  }
  return null;
}

// ─── 소스 2: KIND HTML 파싱 (EUC-KR) ────────────────────────────
async function fetchFromKIND() {
  // iconv-lite는 옵셔널 — 없으면 에러
  let iconv;
  try {
    iconv = (await import('iconv-lite')).default;
  } catch {
    console.error('❌ iconv-lite 모듈이 필요합니다. npm install iconv-lite 후 재시도.');
    process.exit(1);
  }

  const all = [];
  for (const [marketType, market, suffix] of [
    ['stockMkt', 'KOSPI', '.KS'],
    ['kosdaqMkt', 'KOSDAQ', '.KQ'],
  ]) {
    console.log(`⬇️  KIND에서 ${market} 다운로드...`);
    const url = `https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=${marketType}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://kind.krx.co.kr/' },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const html = iconv.decode(buf, 'euc-kr');

    const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let added = 0;
    for (let i = 1; i < rows.length; i++) {
      const cells = (rows[i].match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map((c) =>
        c.replace(/<[^>]+>/g, '').trim()
      );
      let code = '';
      let codeIdx = -1;
      for (let ci = 0; ci < Math.min(cells.length, 6); ci++) {
        if (/^\d{6}$/.test(cells[ci])) {
          code = cells[ci];
          codeIdx = ci;
          break;
        }
      }
      if (!code || codeIdx < 0) continue;
      const name = cells.slice(0, codeIdx).find((c) => c.length > 0) || '';
      if (!name) continue;
      all.push({ code, ticker: code + suffix, name, market });
      added++;
    }
    console.log(`  ${market}: ${added}종목`);
  }
  return all;
}

// ─── 업서트 ─────────────────────────────────────────────────────
async function upsertBatch(rows) {
  const CHUNK = 500;
  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('stock_krx_stocks')
      .upsert(chunk, { onConflict: 'code' });
    if (error) throw error;
    total += chunk.length;
    process.stdout.write(`\r  업서트 ${total}/${rows.length}...`);
  }
  process.stdout.write('\n');
}

// ─── 메인 ──────────────────────────────────────────────────────
(async () => {
  console.log(`${MODE} KRX 종목 시드 시작`);

  let stocks;
  if (FETCH) {
    stocks = await fetchFromKIND();
  } else {
    stocks = loadFromStockWebJson();
    if (!stocks) {
      console.error('❌ StockWeb/data/krx_stocks.json을 찾을 수 없습니다. --fetch로 직접 받으세요.');
      process.exit(1);
    }
  }

  console.log(`📊 로드: ${stocks.length}종목`);
  if (stocks.length === 0) {
    console.error('❌ 종목이 없습니다');
    process.exit(1);
  }
  console.log('  샘플:', stocks.slice(0, 3));

  const markets = stocks.reduce((acc, s) => {
    acc[s.market] = (acc[s.market] || 0) + 1;
    return acc;
  }, {});
  console.log('  분포:', markets);

  // 기존 레코드 수
  const { count: before } = await supabase
    .from('stock_krx_stocks')
    .select('*', { count: 'exact', head: true });
  console.log(`📦 기존 레코드: ${before ?? 0}`);

  if (!COMMIT) {
    console.log('\n🧪 DRY-RUN — 실제로 쓰지 않음. --commit 추가하면 적용.');
    return;
  }

  console.log('\n⬆️  업서트 중...');
  const rows = stocks.map((s) => ({
    code: s.code,
    ticker: s.ticker,
    name: s.name,
    market: s.market,
  }));
  await upsertBatch(rows);

  const { count: after } = await supabase
    .from('stock_krx_stocks')
    .select('*', { count: 'exact', head: true });
  console.log(`✅ 완료. 최종 레코드: ${after}`);
})().catch((e) => {
  console.error('❌', e);
  process.exit(1);
});
