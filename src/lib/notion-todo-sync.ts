// ============================================================================
// 노션 → 앱 동기화 공통 로직 (import + auto-sync 양쪽에서 사용)
// 추가 / 변경 / 삭제(mirror) 모두 처리
// ============================================================================
import type { SupabaseClient } from '@supabase/supabase-js';
import { importNotionDatabase, matchMember, type ImportedTaskRow } from './notion-todo';
import type { TodoNotionSource } from '@/types';

export interface SyncResult {
  total: number;
  inserted: number;
  updated: number;
  removed: number;
  skipped: number;
}

export async function syncNotionSource(
  supabase: SupabaseClient,
  source: TodoNotionSource & { notion_token: string },
): Promise<SyncResult> {
  const rows = await importNotionDatabase(source.notion_token, source.database_id, {
    title_property: source.title_property || undefined,
    date_property: source.date_property || undefined,
    category_property: source.category_property || undefined,
    member_property: source.member_property || undefined,
    filter_property: source.filter_property || undefined,
  });

  // 가족 구성원 (매칭용)
  const { data: members } = await supabase
    .from('members')
    .select('id, name')
    .eq('household_id', source.household_id)
    .eq('is_active', true);
  const memberList = (members ?? []) as { id: string; name: string }[];

  const externalIds = rows.map((r) => r.external_id);

  // 기존 노션 task 조회 — id, external_id, last_edited_time 만 가져와서 비교
  let existingMap = new Map<
    string,
    { id: string; notion_last_edited_time: string | null; status: string }
  >();
  if (externalIds.length > 0) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('id, source_external_id, notion_last_edited_time, status')
      .eq('household_id', source.household_id)
      .eq('source', 'notion')
      .in('source_external_id', externalIds);
    for (const e of existing ?? []) {
      if (e.source_external_id) {
        existingMap.set(e.source_external_id as string, {
          id: e.id as string,
          notion_last_edited_time: e.notion_last_edited_time as string | null,
          status: e.status as string,
        });
      }
    }
  }

  // 행 분리: 신규 / 변경 / 동일
  const toInsertRows: ImportedTaskRow[] = [];
  const toUpdateRows: { row: ImportedTaskRow; taskId: string }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const existing = existingMap.get(r.external_id);
    if (!existing) {
      toInsertRows.push(r);
    } else if (
      existing.status === 'cancelled' ||
      !existing.notion_last_edited_time ||
      (r.last_edited_time && r.last_edited_time !== existing.notion_last_edited_time)
    ) {
      // cancelled 였다가 노션에 다시 살아난 경우도 update 로 복구
      toUpdateRows.push({ row: r, taskId: existing.id });
    } else {
      skipped++;
    }
  }

  const buildPayload = (r: ImportedTaskRow) => {
    const matchedIds: string[] = [];
    for (const nm of r.people_names) {
      const hit = matchMember(nm, memberList);
      if (hit && !matchedIds.includes(hit.id)) matchedIds.push(hit.id);
    }
    return {
      title: r.title,
      category_main: r.category_main,
      category_sub: r.category_sub,
      member_id: matchedIds[0] ?? null,
      target_member_ids: matchedIds,
      is_fixed: r.is_fixed,
      due_date: r.due_date,
      end_date: r.end_date,
      due_time: r.due_time,
      end_time: r.end_time,
      notion_last_edited_time: r.last_edited_time,
    };
  };

  // INSERT — 단, 같은 내용 (제목 + 시작일 + 시작시간) 의 task 가 이미 있으면
  // (예: 구글 sync 가 먼저 같은 일정을 가져왔을 때) 새로 만들지 않고 기존 task 에
  // notion source_external_id 만 매핑한다.
  let inserted = 0;
  let linked = 0;
  for (const r of toInsertRows) {
    const payload = buildPayload(r);
    // 기존 매칭 task 검색 — source_external_id 가 비어있는 것 (= 다른 sync 가 만든 거)
    // dedup: title + due_date + due_time 일치하는 task 가 있으면 합치기
    // (다른 sync 소스가 만든 task 거나, 같은 노션 페이지가 새 ID 로 들어와도)
    let q = supabase
      .from('tasks')
      .select('id, source_external_id')
      .eq('household_id', source.household_id)
      .eq('kind', 'event')
      .eq('is_active', true)
      .eq('title', payload.title)
      .eq('due_date', payload.due_date as string);
    if (payload.due_time) q = q.eq('due_time', payload.due_time as string);
    else q = q.is('due_time', null);

    const { data: cand } = await q.limit(1);
    const existing = cand?.[0];

    if (existing) {
      await supabase
        .from('tasks')
        .update({
          source: 'notion',
          source_external_id: r.external_id,
          notion_last_edited_time: r.last_edited_time,
        })
        .eq('id', existing.id);
      linked++;
    } else {
      const { error: insErr } = await supabase.from('tasks').insert({
        household_id: source.household_id,
        type: 'one_time' as const,
        memo: '',
        priority: 'normal' as const,
        recurrence: null,
        status: 'pending' as const,
        is_active: true,
        source: 'notion' as const,
        source_external_id: r.external_id,
        ...payload,
      });
      if (insErr) throw insErr;
      inserted++;
    }
  }
  void linked;

  // UPDATE — 한 행씩 (Supabase bulk update by id 가 PostgREST 로 직접 안 됨)
  let updated = 0;
  for (const { row, taskId } of toUpdateRows) {
    const payload = {
      ...buildPayload(row),
      // 사용자가 cancelled 처리했다 다시 살아난 경우 활성화
      status: 'pending' as const,
      is_active: true,
    };
    const { error: upErr } = await supabase.from('tasks').update(payload).eq('id', taskId);
    if (!upErr) updated++;
    else console.error('[sync update]', upErr);
  }

  // MIRROR 삭제 — 노션에 없는 external_id 는 cancel
  const liveIds = new Set(rows.map((r) => r.external_id));
  const { data: appNotionTasks } = await supabase
    .from('tasks')
    .select('id, source_external_id')
    .eq('household_id', source.household_id)
    .eq('source', 'notion')
    .neq('status', 'cancelled');
  const toRemoveIds = (appNotionTasks ?? [])
    .filter((t) => t.source_external_id && !liveIds.has(t.source_external_id as string))
    .map((t) => t.id as string);
  let removed = 0;
  if (toRemoveIds.length > 0) {
    const { error: rmErr } = await supabase
      .from('tasks')
      .update({ status: 'cancelled', is_active: false })
      .in('id', toRemoveIds);
    if (!rmErr) removed = toRemoveIds.length;
    else console.error('[sync mirror remove]', rmErr);
  }

  await supabase
    .from('todo_notion_sources')
    .update({ last_imported_at: new Date().toISOString() })
    .eq('id', source.id);

  return {
    total: rows.length,
    inserted,
    updated,
    removed,
    skipped,
  };
}
