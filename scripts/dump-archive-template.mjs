#!/usr/bin/env node
/**
 * 본인 Supabase 의 archive_collections 를 dump 해서
 * src/db/schema-template.sql 의 ARCHIVE_TEMPLATE_START ~ END 블록에 삽입.
 *
 * 사용:
 *   node --env-file=.env.local scripts/dump-archive-template.mjs
 *
 * 효과:
 *   - 친구가 schema-template.sql 한 번 실행하면 본인의 컬렉션 구조가
 *     빈 상태로 자동 생성됨 (entries 데이터는 빠짐 — 구조만)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TPL_PATH = resolve(__dirname, '..', 'src', 'db', 'schema-template.sql');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HID =
  process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID ??
  '00000000-0000-0000-0000-000000000001';
const PLACEHOLDER_HID = '00000000-0000-0000-0000-000000000001';

if (!url || !key) {
  console.error(
    '❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수 필요',
  );
  console.error(
    '   사용: node --env-file=.env.local scripts/dump-archive-template.mjs',
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from('archive_collections')
  .select('name, emoji, color, description, schema, position, card_layout')
  .eq('household_id', HID)
  .eq('is_active', true)
  .order('position', { ascending: true })
  .order('created_at', { ascending: true });

if (error) {
  console.error('❌ Supabase 조회 실패:', error.message);
  process.exit(1);
}

const collections = data ?? [];
console.log(`📚 ${collections.length} 개 컬렉션 발견`);
collections.forEach((c) => console.log(`  - ${c.emoji} ${c.name}`));

const sqlEscape = (s) => String(s ?? '').replace(/'/g, "''");

const lines = [
  '-- ARCHIVE_TEMPLATE_START',
  '-- 자동 생성됨 — scripts/dump-archive-template.mjs 로 갱신하세요.',
  `-- 마지막 dump: ${new Date().toISOString()}`,
  `-- 컬렉션 ${collections.length}개`,
  '',
];

for (const c of collections) {
  const name = sqlEscape(c.name);
  const emoji = sqlEscape(c.emoji ?? '📦');
  const color = sqlEscape(c.color ?? '#6366f1');
  const desc = sqlEscape(c.description ?? '');
  const schemaJson = sqlEscape(JSON.stringify(c.schema ?? []));
  const pos = c.position ?? 0;
  const layout = sqlEscape(c.card_layout ?? 'list');
  lines.push(
    `INSERT INTO archive_collections (household_id, name, emoji, color, description, schema, position, card_layout, is_active)`,
  );
  lines.push(
    `SELECT '${PLACEHOLDER_HID}', '${name}', '${emoji}', '${color}', '${desc}', '${schemaJson}'::jsonb, ${pos}, '${layout}', true`,
  );
  lines.push(
    `WHERE NOT EXISTS (SELECT 1 FROM archive_collections WHERE household_id='${PLACEHOLDER_HID}' AND name='${name}' AND is_active=true);`,
  );
  lines.push('');
}

lines.push('-- ARCHIVE_TEMPLATE_END');
const newBlock = lines.join('\n');

const tpl = readFileSync(TPL_PATH, 'utf-8');
const re = /-- ARCHIVE_TEMPLATE_START[\s\S]*?-- ARCHIVE_TEMPLATE_END/;
if (!re.test(tpl)) {
  console.error(
    '❌ schema-template.sql 에 ARCHIVE_TEMPLATE_START / END 마커가 없습니다.',
  );
  process.exit(1);
}
const updated = tpl.replace(re, newBlock);
writeFileSync(TPL_PATH, updated, 'utf-8');
console.log(`✅ ${TPL_PATH} 업데이트 완료`);
