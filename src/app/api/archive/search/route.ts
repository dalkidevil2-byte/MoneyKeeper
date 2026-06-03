export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type SchemaProp = { key: string; label: string; type: string };

// 컬렉션 schema 기준으로 항목의 대표 제목/스니펫 추출
function deriveTitle(data: Record<string, unknown>, schema: SchemaProp[]): string {
  // 우선순위: title 타입 → 첫 text 타입 → 첫 비어있지 않은 값
  const order = [
    ...schema.filter((p) => p.type === 'title'),
    ...schema.filter((p) => p.type === 'text'),
    ...schema,
  ];
  for (const p of order) {
    const v = data[p.key];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  for (const v of Object.values(data)) {
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '(제목 없음)';
}

function matchData(data: Record<string, unknown>, q: string): boolean {
  for (const v of Object.values(data)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      if (v.some((x) => String(x).toLowerCase().includes(q))) return true;
    } else if (String(v).toLowerCase().includes(q)) {
      return true;
    }
  }
  return false;
}

// GET /api/archive/search?q=...&household_id=...&limit=50
// 모든 컬렉션의 항목을 가로질러 검색 (항목 데이터 + 컬렉션 이름)
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const q = (searchParams.get('q') ?? '').trim().toLowerCase();
  const limit = parseInt(searchParams.get('limit') ?? '50');

  if (!q) return NextResponse.json({ collections: [], entries: [] });

  try {
    const { data: collections, error: cErr } = await supabase
      .from('archive_collections')
      .select('id, name, emoji, color, description, schema, parent_id')
      .eq('household_id', householdId)
      .eq('is_active', true);
    if (cErr) throw cErr;

    const colMap = new Map<string, (typeof collections)[number]>();
    for (const c of collections ?? []) colMap.set(c.id as string, c);

    // 컬렉션 이름/설명 매칭
    const matchedCollections = (collections ?? []).filter(
      (c) =>
        String(c.name ?? '').toLowerCase().includes(q) ||
        String(c.description ?? '').toLowerCase().includes(q),
    );

    // 항목 매칭 — 세대 내 활성 컬렉션 항목을 가져와 JS 필터 (개인 규모라 충분)
    const ids = (collections ?? []).map((c) => c.id as string);
    const entries: Array<{
      id: string;
      collection_id: string;
      collection_name: string;
      collection_emoji: string;
      collection_color: string;
      title: string;
      updated_at: string;
    }> = [];

    if (ids.length > 0) {
      const { data: rows, error: eErr } = await supabase
        .from('archive_entries')
        .select('id, collection_id, data, updated_at')
        .in('collection_id', ids)
        .order('updated_at', { ascending: false })
        .limit(4000);
      if (eErr) throw eErr;

      for (const r of rows ?? []) {
        const data = (r.data ?? {}) as Record<string, unknown>;
        if (!matchData(data, q)) continue;
        const col = colMap.get(r.collection_id as string);
        if (!col) continue;
        const schema = (col.schema ?? []) as SchemaProp[];
        entries.push({
          id: r.id as string,
          collection_id: r.collection_id as string,
          collection_name: String(col.name ?? ''),
          collection_emoji: String(col.emoji ?? '📦'),
          collection_color: String(col.color ?? '#6366f1'),
          title: deriveTitle(data, schema),
          updated_at: String(r.updated_at ?? ''),
        });
        if (entries.length >= limit) break;
      }
    }

    return NextResponse.json({ collections: matchedCollections, entries });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '검색 실패' },
      { status: 500 },
    );
  }
}
