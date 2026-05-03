import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveProperty } from '@/types';

/**
 * 활동 통계용 4개 속성을 컬렉션 스키마에 자동 추가 (이미 있으면 건너뜀).
 * 활동의 link_collection_id 가 설정/변경됐을 때 호출.
 */
const STAT_PROPS: ArchiveProperty[] = [
  {
    key: '_stat_count',
    label: '횟수',
    type: 'activity_stat',
    stat_kind: 'count',
    auto_added: true,
  },
  {
    key: '_stat_total_min',
    label: '총 시간',
    type: 'activity_stat',
    stat_kind: 'total_min',
    auto_added: true,
  },
  {
    key: '_stat_avg_min',
    label: '평균',
    type: 'activity_stat',
    stat_kind: 'avg_min',
    auto_added: true,
  },
  {
    key: '_stat_last_date',
    label: '마지막',
    type: 'activity_stat',
    stat_kind: 'last_date',
    auto_added: true,
  },
];

export async function ensureActivityStatProperties(
  supabase: SupabaseClient,
  collectionId: string,
): Promise<void> {
  try {
    const { data: col } = await supabase
      .from('archive_collections')
      .select('schema')
      .eq('id', collectionId)
      .maybeSingle();
    if (!col) return;
    const current = (col.schema ?? []) as ArchiveProperty[];
    const existingKeys = new Set(current.map((p) => p.key));
    const toAdd = STAT_PROPS.filter((p) => !existingKeys.has(p.key));
    if (toAdd.length === 0) return;
    const next = [...current, ...toAdd];
    await supabase
      .from('archive_collections')
      .update({ schema: next })
      .eq('id', collectionId);
  } catch (e) {
    console.warn('[ensureActivityStatProperties] failed:', e);
  }
}
