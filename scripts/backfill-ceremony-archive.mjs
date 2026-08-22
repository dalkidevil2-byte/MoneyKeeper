/**
 * 이미 있는 축의·조의 거래를 아카이브 '경조사' 에 소급 기록한다. (2026-08 일회성)
 *
 *   node --env-file=.env.local scripts/backfill-ceremony-archive.mjs        # 미리보기
 *   node --env-file=.env.local scripts/backfill-ceremony-archive.mjs --apply
 *
 * 앞으로 들어올 거래를 처리하는 것과 똑같은 함수(syncCeremonyArchive)를 그대로 부른다.
 * 소급용 로직을 따로 쓰면 둘이 어긋나고, 어긋난 걸 나중에 알아채기 어렵다.
 *
 * 손으로 이미 적어둔 항목과 겹치는 거래는 건너뛴다 — 같은 경조사가 두 줄로 남으면
 * 나중에 "얼마 했더라" 를 볼 때 오히려 틀리게 된다.
 * 겹침 판단은 금액이 같고 날짜가 사흘 이내인 것.
 */

import { createClient } from '@supabase/supabase-js';
import { syncCeremonyArchive } from '../src/lib/ceremony-archive.ts';

const APPLY = process.argv.includes('--apply');
const COLLECTION_NAME = '경조사';
const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const daysApart = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

const { data: collection } = await supabase
  .from('archive_collections')
  .select('id')
  .eq('household_id', HOUSEHOLD_ID)
  .eq('name', COLLECTION_NAME)
  .eq('is_active', true)
  .maybeSingle();

if (!collection) {
  console.error(`아카이브에 '${COLLECTION_NAME}' 컬렉션이 없습니다.`);
  process.exit(1);
}

const { data: entries } = await supabase
  .from('archive_entries')
  .select('id, data')
  .eq('collection_id', collection.id);

const { data: txs } = await supabase
  .from('transactions')
  .select('id, household_id, date, type, amount, name, merchant_name, memo, member_id, category_main, category_sub, status')
  .eq('household_id', HOUSEHOLD_ID)
  .eq('category_main', '경조사·모임')
  .in('category_sub', ['축의', '조의'])
  .neq('status', 'cancelled')
  .order('date');

console.log(APPLY ? '=== 실제 적용 ===' : '=== 미리보기 (--apply 를 붙이면 실제로 기록합니다) ===');
console.log(`축의·조의 거래 ${txs.length}건 · 아카이브 기존 항목 ${entries.length}건\n`);

let done = 0;
let skipped = 0;

for (const tx of txs) {
  const label = `${tx.date}  ${tx.category_sub}  ${String(tx.amount).padStart(7)}  ${tx.name || tx.merchant_name}`;

  // 이 거래로 이미 자동 기록한 것이 있으면 넘어간다
  if (entries.some((e) => e.data?.tx_id === tx.id)) {
    console.log(`  건너뜀(이미 기록) ${label}`);
    skipped++;
    continue;
  }

  // 손으로 적어둔 것과 겹치는지 — 금액 같고 날짜 사흘 이내
  const twin = entries.find(
    (e) => Number(e.data?.amount) === Number(tx.amount) && e.data?.date && daysApart(e.data.date, tx.date) <= 3,
  );
  if (twin) {
    console.log(`  건너뜀(손으로 적힌 것과 겹침: "${twin.data.who}") ${label}`);
    skipped++;
    continue;
  }

  if (!APPLY) {
    console.log(`  기록예정 ${label}`);
    done++;
    continue;
  }

  const res = await syncCeremonyArchive(supabase, tx);
  console.log(`  ${res.action.padEnd(8)} ${label}`);
  if (res.action === 'created') done++;
  else skipped++;
}

console.log(`\n${APPLY ? '기록' : '기록 예정'} ${done}건 · 건너뜀 ${skipped}건`);
