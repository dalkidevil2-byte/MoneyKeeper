/**
 * 분류 정리 — 옛 대/소분류를 새 체계로 옮긴다. (2026-08 일회성)
 *
 *   node --env-file=.env.local scripts/migrate-categories.mjs        # 미리보기 (아무것도 안 바꿈)
 *   node --env-file=.env.local scripts/migrate-categories.mjs --apply
 *
 * 대분류 24개 · 조합 84개 → 대분류 12개 · 조합 40개.
 * 어디로 갔는지는 아래 MAP 이 전부다. 없는 조합은 대분류만 옮기고
 * 소분류는 비운다 — 애매한 것을 억지로 끼워 맞추지 않는다.
 */

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes('--apply');

// '옛 대분류>옛 소분류' → [새 대분류, 새 소분류]
const MAP = {
  // ── 식비 (카페·야식 흡수) ──
  '식비>장보기': ['식비', '장보기'],
  '식비>식재료': ['식비', '장보기'],
  '식비>반찬': ['식비', '장보기'],
  '식비>과일': ['식비', '장보기'],
  '식비>계란': ['식비', '장보기'],
  '식비>두부': ['식비', '장보기'],
  '식비>조미료': ['식비', '장보기'],
  '식비>라면': ['식비', '장보기'],
  '식비>쥬스': ['식비', '장보기'],
  '식비>외식': ['식비', '외식'],
  '식비>식권': ['식비', '외식'],
  '식비>포장': ['식비', '외식'],
  '식비>배달': ['식비', '배달'],
  '식비>피자': ['식비', '배달'],
  '식비>간식': ['식비', '간식'],
  '식비>소고기': ['식비', '육고기'],
  '식비>돼지고기': ['식비', '육고기'],
  '식비>닭고기': ['식비', '육고기'],
  '식비>해산물': ['식비', '해산물'],
  '식비>생선': ['식비', '해산물'],

  '카페>': ['식비', '카페'],
  '카페>커피': ['식비', '카페'],
  '카페>음료': ['식비', '카페'],
  '카페>디저트': ['식비', '카페'],
  '카페>베이커리': ['식비', '카페'],
  '음료>': ['식비', '카페'],

  '야식>': ['식비', '간식'],
  '야식>소주': ['식비', '술'],
  '야식>맥주': ['식비', '술'],
  '야식>와인': ['식비', '술'],
  '야식>술': ['식비', '술'],
  '야식>안주': ['식비', '술'],
  '야식>과자': ['식비', '간식'],
  '야식>오징어': ['식비', '간식'],
  '야식>아이스크림': ['식비', '간식'],
  '야식>피자': ['식비', '배달'],
  '야>': ['기타', ''], // 오타로 만들어진 대분류

  // ── 생활 (쇼핑·미용·뷰티 흡수) ──
  '생활>소모품': ['생활', '생필품'],
  '생활>세제': ['생활', '생필품'],
  '생활>청소용품': ['생활', '생필품'],
  '생활>욕실용품': ['생활', '생필품'],
  '생활>목욕용품': ['생활', '생필품'],
  '생활>주방용품': ['생활', '생필품'],
  '생활>정리수납': ['생활', '생필품'],
  '생활>잡화': ['생활', '잡화'],
  '생활>의류관리': ['생활', '의류'],
  '생활>수선비': ['생활', '의류'],
  '생활>헤어': ['생활', '미용'],

  '쇼핑>의류': ['생활', '의류'],
  '쇼핑>속옷': ['생활', '의류'],
  '쇼핑>잡화': ['생활', '잡화'],
  '쇼핑>전자제품': ['생활', '잡화'],
  '쇼핑>생활용품': ['생활', '생필품'],
  '쇼핑>욕실용품': ['생활', '생필품'],
  '쇼핑>미용': ['생활', '미용'],
  '쇼핑>': ['생활', ''],

  '미용>': ['생활', '미용'],
  '미용>팩': ['생활', '미용'],
  '뷰티>': ['생활', '미용'],
  '뷰티>네일': ['생활', '미용'],

  '주거>주방용품': ['생활', '생필품'],
  '주거>인테리어': ['생활', '잡화'],
  '주거>가전': ['생활', '잡화'],
  '주거>가구': ['생활', '잡화'],

  // ── 취미 (운동·교육 흡수) ──
  '취미>골프': ['취미', '골프'],
  '취미>스포츠': ['취미', '운동'],
  '취미>문화생활': ['취미', '문화생활'],
  '취미>게임': ['취미', '문화생활'],
  '취미>물멍': ['취미', '문화생활'],
  '취미>코딩': ['취미', '문화생활'],
  '취미>OTT구독': ['취미', '구독'],
  '취미>AI 구독': ['취미', '구독'],

  '운동>': ['취미', '운동'],
  '운동>헬스장': ['취미', '운동'],
  '운동>필라테스': ['취미', '운동'],
  '운동>등산': ['취미', '운동'],

  '교육>운동': ['취미', '운동'],
  '교육>학원': ['취미', '문화생활'],
  '교육>도서': ['취미', '문화생활'],
  '교육>온라인강의': ['취미', '문화생활'],
  '교육>': ['취미', ''],

  // ── 의료 ──
  '의료>병원': ['의료', '병원'],
  '의료>약국': ['의료', '약국'],
  '의료>건강식품': ['의료', '약국'],

  // ── 경조사·모임 (모임·부모님 흡수) ──
  '경조사>축하': ['경조사·모임', '축의'],
  '경조사>조의금': ['경조사·모임', '조의'],
  '경조사>기타': ['경조사·모임', ''], // 축의인지 조의인지 알 수 없어 비운다
  '경조사>': ['경조사·모임', ''],
  '모임>': ['경조사·모임', '모임'],
  '모임>가족': ['경조사·모임', '모임'],
  '모임>지인': ['경조사·모임', '모임'],
  '부모님>': ['경조사·모임', '부모님'],
  '부모님>용돈': ['경조사·모임', '부모님'],

  // ── 교통 ──
  '교통>대중교통': ['교통', '대중교통'],
  '교통>주유': ['교통', '주유'],
  '교통>택시': ['교통', '택시'],
  '교통>주차': ['교통', '차량관리'],
  '교통>차 관리비': ['교통', '차량관리'],
  '교통>자동차 관리': ['교통', '차량관리'],

  // ── 여행 ──
  '여행>': ['여행', ''],
  '여행>교통': ['여행', '교통'],
  '여행>숙박': ['여행', '숙박'],
  '여행>식비': ['여행', '식비'],
  '여행>해외': ['여행', '기타'],
  '여행>여권': ['여행', '기타'],
  '여행>여권사진': ['여행', '기타'],
  '여행>기타': ['여행', '기타'],

  // ── 육아 ──
  '육아>놀이공원': ['육아', '놀이'],
  '육아>학습': ['육아', '교육'],
  '육아>교육': ['육아', '교육'],
  '육아>교육비': ['육아', '교육'],
  '육아>분유/기저귀': ['육아', '용품'],
  '육아>장난감': ['육아', '용품'],
  '육아>육아용품': ['육아', '용품'],

  // ── 출장 (별도 대분류로 유지) ──
  '출장>교통': ['출장', '교통'],
  '출장>숙박': ['출장', '숙박'],
  '출장>식비': ['출장', '식비'],
  '출장>기타': ['출장', '기타'],
  '출장>출장비수령': ['수입', '기타'],

  // ── 고정비 (주거 관리비·구독료 흡수) ──
  '고정비>': ['고정비', ''],
  '고정비>관리비': ['고정비', '관리비'],
  '고정비>월세': ['고정비', '관리비'],
  '고정비>보험료': ['고정비', '보험'],
  '고정비>상조': ['고정비', '보험'],
  '고정비>통신비': ['고정비', '통신'],
  '고정비>구독료': ['고정비', '구독료'],
  '주거>관리비': ['고정비', '관리비'],
  '주거>': ['고정비', '관리비'],
  '구독료>': ['고정비', '구독료'],
  '구독료>멤버쉽': ['고정비', '구독료'],

  // ── 수입 ──
  '수입>': ['수입', ''],
  '수입>급여': ['수입', '급여'],
  '수입>복지비': ['수입', '기타'],

  // ── 기타로 흡수 ──
  '회사>': ['기타', ''],
  '회사>업무': ['기타', ''],
  '저축/투자>': ['기타', ''],
  '저축/투자>적금': ['기타', ''],
  '저축/투자>주식': ['기타', ''],
  '저축/투자>펀드': ['기타', ''],
  '저축/투자>코인': ['기타', ''],
  '기타>': ['기타', ''],
};

// 정리 후 남을 분류 — custom_categories 를 이걸로 새로 만든다
const NEW = {
  '식비': ['장보기', '외식', '배달', '카페', '간식', '술', '육고기', '해산물'],
  '생활': ['생필품', '의류', '잡화', '미용'],
  '교통': ['대중교통', '주유', '택시', '차량관리'],
  '의료': ['병원', '약국'],
  '취미': ['골프', '운동', '문화생활', '구독'],
  '육아': ['교육', '놀이', '용품'],
  '여행': ['교통', '숙박', '식비', '기타'],
  '출장': ['교통', '숙박', '식비', '기타'],
  '경조사·모임': ['축의', '조의', '모임', '부모님'],
  '고정비': ['관리비', '보험', '통신', '구독료'],
  '수입': ['급여', '기타'],
  '기타': [],
};

const headers = { apikey: K, Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' };
const get = async (p) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { headers });
  if (!r.ok) throw new Error(`GET ${p}: ${r.status} ${await r.text()}`);
  return r.json();
};
const patch = async (p, body) => {
  const r = await fetch(`${U}/rest/v1/${p}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${p}: ${r.status} ${await r.text()}`);
};

/** 옛 분류 → 새 분류. 표에 없으면 대분류만 살리고 소분류는 비운다. */
function remap(main, sub) {
  const key = `${main || ''}>${sub || ''}`;
  if (MAP[key]) return MAP[key];
  if (!main) return null;                       // 미분류는 건드리지 않는다
  if (NEW[main]) return [main, NEW[main].includes(sub) ? sub : ''];
  const fallback = MAP[`${main}>`];
  return fallback ?? ['기타', ''];
}

async function migrateTable(table, label) {
  const rows = await get(`${table}?select=id,category_main,category_sub&limit=10000`);
  const changes = [];
  for (const r of rows) {
    const to = remap(r.category_main, r.category_sub);
    if (!to) continue;
    const [main, sub] = to;
    if (main === (r.category_main ?? '') && sub === (r.category_sub ?? '')) continue;
    changes.push({ id: r.id, from: `${r.category_main || '(빈)'}>${r.category_sub || ''}`, main, sub });
  }

  const summary = new Map();
  for (const c of changes) {
    const k = `${c.from}  →  ${c.main}>${c.sub}`;
    summary.set(k, (summary.get(k) ?? 0) + 1);
  }
  console.log(`\n[${label}] ${rows.length}건 중 ${changes.length}건 변경`);
  for (const [k, v] of [...summary].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  if (!APPLY) return;
  for (const c of changes) {
    await patch(`${table}?id=eq.${c.id}`, { category_main: c.main, category_sub: c.sub });
  }
  console.log(`  → ${changes.length}건 적용 완료`);
}

async function rebuildCustomCategories() {
  const rows = await get('custom_categories?select=id,category_main,category_sub&limit=1000');
  const want = new Set();
  for (const [main, subs] of Object.entries(NEW)) {
    want.add(`${main}>`);
    for (const s of subs) want.add(`${main}>${s}`);
  }
  const have = new Set(rows.map((r) => `${r.category_main}>${r.category_sub || ''}`));
  const toDelete = rows.filter((r) => !want.has(`${r.category_main}>${r.category_sub || ''}`));
  const toAdd = [...want].filter((k) => !have.has(k));

  console.log(`\n[custom_categories] 현재 ${rows.length}개 → 정리 후 ${want.size}개`);
  console.log(`  삭제 ${toDelete.length}개 · 추가 ${toAdd.length}개`);

  if (!APPLY) return;
  const householdId = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;
  for (const r of toDelete) {
    const res = await fetch(`${U}/rest/v1/custom_categories?id=eq.${r.id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(`DELETE: ${res.status} ${await res.text()}`);
  }
  if (toAdd.length) {
    const body = toAdd.map((k) => {
      const [main, sub] = k.split('>');
      return { household_id: householdId, category_main: main, category_sub: sub ?? '' };
    });
    const res = await fetch(`${U}/rest/v1/custom_categories`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`INSERT: ${res.status} ${await res.text()}`);
  }
  console.log('  → 적용 완료');
}

console.log(APPLY ? '=== 실제 적용 ===' : '=== 미리보기 (--apply 를 붙이면 실제로 바꿉니다) ===');
await migrateTable('transactions', '거래');
await migrateTable('items', '품목');
await migrateTable('fixed_expense_templates', '고정지출 템플릿');
await rebuildCustomCategories();
console.log('\n끝.');
