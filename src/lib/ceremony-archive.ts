import type { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────
// 축의·조의 거래 → 아카이브 '경조사' 컬렉션 자동 기록
//
// 경조사는 "얼마 썼나" 보다 "누구한테 얼마 했나" 가 남아야 하는 기록이다.
// 몇 년 뒤 상대 경조사 때 그만큼 돌려주려면 찾아볼 수 있어야 한다.
// 가계부에 넣을 때 아카이브에도 손으로 또 적는 건 두 번 일이라 자동으로 옮긴다.
//
// 연결고리는 항목 data 안의 tx_id 다. 거래마다 항목 하나.
// (transactions 에 컬럼을 추가하지 않아도 되도록 — 손으로 돌려야 하는 SQL 을 늘리지 않는다)
//
// 사람이 아카이브에서 직접 고친 항목은 건드리지 않는다.
// 자동이 사람의 수정을 덮어쓰면 그때부터 아무도 자동을 믿지 않는다.
// 고쳤는지 판단은 auto_snapshot — 자동이 마지막으로 써넣은 값 사본이다.
// 지금 값이 사본과 같으면 아무도 손대지 않은 것이므로 계속 맞춰도 된다.
// ─────────────────────────────────────────

const COLLECTION_NAME = '경조사';
const CATEGORY_MAIN = '경조사·모임';
const CATEGORY_SUBS = ['축의', '조의'];

/** 거래 이름에서 무슨 행사인지 짐작한다. 못 찾으면 축의=결혼 / 조의=장례. */
const OCCASION_HINTS: Array<[RegExp, string]> = [
  [/결혼|웨딩|청첩|혼례/, '결혼'],
  [/돌잔치|백일/, '돌잔치'],
  [/장례|부고|조의|빈소|발인|상가/, '장례'],
  [/환갑|회갑/, '환갑'],
  [/칠순|고희/, '칠순'],
  [/입학/, '입학'],
  [/졸업/, '졸업'],
  [/생일|생신/, '생일'],
  // 경조사로 넣긴 했지만 위 어느 것도 아닌 것 — 기본값(결혼/장례)으로 두면 거짓 기록이 된다
  [/어버이날|스승의날|명절|추석|설날|용돈|선물|이전|개업|집들이/, '기타'],
];

export interface CeremonyTx {
  id: string;
  household_id: string;
  date: string;
  type: string;
  amount: number;
  name?: string | null;
  merchant_name?: string | null;
  memo?: string | null;
  member_id?: string | null;
  category_main?: string | null;
  category_sub?: string | null;
  status?: string | null;
}

/** 이 거래가 경조사 기록 대상인가 */
export function isCeremonyTx(tx: CeremonyTx): boolean {
  if (tx.status === 'cancelled') return false;
  return tx.category_main === CATEGORY_MAIN && CATEGORY_SUBS.includes(tx.category_sub ?? '');
}

function inferOccasion(text: string, sub: string): string {
  for (const [re, name] of OCCASION_HINTS) {
    if (re.test(text)) return name;
  }
  return sub === '조의' ? '장례' : '결혼';
}

/** 자동이 관리하는 필드 */
const OWNED = ['who', 'occasion', 'date', 'amount', 'direction', 'memo'] as const;

/** 항목을 사람이 손댔는지 — 자동이 마지막에 써넣은 값과 지금 값이 같으면 안 손댄 것 */
function untouched(entryData: Record<string, unknown>): boolean {
  const snap = entryData.auto_snapshot as Record<string, unknown> | undefined;
  if (!snap) return false; // 자동이 만든 게 아니면 남의 것 — 건드리지 않는다
  return OWNED.every((k) => JSON.stringify(entryData[k] ?? null) === JSON.stringify(snap[k] ?? null));
}

/**
 * 거래 하나를 아카이브와 맞춘다.
 *   대상이면  → 없으면 만들고, 있으면(사람이 안 고쳤으면) 내용을 맞춘다
 *   대상 아니면 → 자동으로 만들어둔 항목이 남아 있으면 치운다
 *
 * 아카이브 기록 실패가 가계부 저장을 막아서는 안 되므로 예외는 안에서 삼킨다.
 */
export async function syncCeremonyArchive(
  supabase: SupabaseClient,
  tx: CeremonyTx,
): Promise<{ action: 'created' | 'updated' | 'removed' | 'skipped'; entry_id?: string }> {
  try {
    const { data: collection } = await supabase
      .from('archive_collections')
      .select('id, schema')
      .eq('household_id', tx.household_id)
      .eq('name', COLLECTION_NAME)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    // 컬렉션이 없으면 아무것도 하지 않는다.
    // 자동으로 만들어버리면 사용자가 원치 않는 컬렉션이 생긴다.
    if (!collection) return { action: 'skipped' };

    const { data: existing } = await supabase
      .from('archive_entries')
      .select('id, data')
      .eq('collection_id', collection.id)
      .eq('data->>tx_id', tx.id)
      .limit(1)
      .maybeSingle();

    // ── 대상이 아니게 된 경우 ── 분류를 잘못 골랐다가 고친 상황
    if (!isCeremonyTx(tx)) {
      if (existing && untouched(existing.data ?? {})) {
        await supabase.from('archive_entries').delete().eq('id', existing.id);
        return { action: 'removed', entry_id: existing.id };
      }
      return { action: 'skipped' };
    }

    // 사람이 고친 항목은 그대로 둔다
    if (existing && !untouched(existing.data ?? {})) return { action: 'skipped', entry_id: existing.id };

    const sub = tx.category_sub ?? '';
    const who = (tx.name || tx.merchant_name || '').trim() || '(대상 미기재)';
    const occasionRaw = inferOccasion(`${tx.name ?? ''} ${tx.merchant_name ?? ''} ${tx.memo ?? ''}`, sub);

    // 컬렉션이 가진 선택지에 없는 값은 넣지 않는다 (선택 속성이 깨진 값으로 남는 걸 방지)
    type Prop = { key: string; options?: string[] };
    const props: Prop[] = Array.isArray(collection.schema) ? collection.schema : [];
    const occasionOptions = props.find((p) => p.key === 'occasion')?.options ?? [];
    const occasion = occasionOptions.length === 0 || occasionOptions.includes(occasionRaw)
      ? occasionRaw
      : '기타';

    const fields = {
      who,
      occasion,
      date: tx.date,
      amount: tx.amount,
      // 받은 것(수입)이면 '수령', 낸 것이면 '전달'
      direction: tx.type === 'income' ? '수령' : '전달',
      memo: [tx.memo?.trim(), '📒 가계부에서 자동 기록'].filter(Boolean).join('\n'),
    };
    // auto_snapshot — 다음에 '사람이 고쳤나' 를 판단할 기준값 사본
    const data = { ...fields, tx_id: tx.id, auto_snapshot: fields };

    if (existing) {
      await supabase
        .from('archive_entries')
        .update({ data, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      return { action: 'updated', entry_id: existing.id };
    }

    const { data: created } = await supabase
      .from('archive_entries')
      .insert({
        collection_id: collection.id,
        household_id: tx.household_id,
        member_id: tx.member_id ?? null,
        data,
      })
      .select('id')
      .single();

    return { action: 'created', entry_id: created?.id };
  } catch (e) {
    console.error('[ceremony-archive]', e);
    return { action: 'skipped' };
  }
}
