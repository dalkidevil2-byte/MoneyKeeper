export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 컬렉션의 항목 목록
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '200');
  try {
    const { data, error } = await supabase
      .from('archive_entries')
      .select('*')
      .eq('collection_id', id)
      // position 우선 (사용자 지정 순서) → 같은 position 안에서 최신순
      .order('position', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    const entries = (data ?? []) as Array<{ id: string; data: Record<string, unknown> }>;

    // 활동 통계 자동 계산 (activity_stat 속성이 있을 때만)
    const { data: col } = await supabase
      .from('archive_collections')
      .select('schema')
      .eq('id', id)
      .maybeSingle();
    type SchemaProp = { key: string; type?: string; stat_kind?: string };
    const schema = (col?.schema ?? []) as SchemaProp[];
    const statProps = schema.filter((p) => p.type === 'activity_stat');
    if (statProps.length > 0 && entries.length > 0) {
      const entryIds = entries.map((e) => e.id);
      const { data: sessions } = await supabase
        .from('activity_sessions')
        .select('archive_links, duration_minutes, session_date, end_at')
        .filter('archive_links', 'cs', JSON.stringify([{ collection_id: id }]))
        .not('end_at', 'is', null);

      const stats = new Map<
        string,
        { count: number; total: number; lastDate: string | null; firstDate: string | null }
      >();
      for (const s of (sessions ?? []) as Array<{
        archive_links: Array<{ collection_id: string; entry_id: string }>;
        duration_minutes: number | null;
        session_date: string;
      }>) {
        for (const link of s.archive_links ?? []) {
          if (link.collection_id !== id) continue;
          if (!entryIds.includes(link.entry_id)) continue;
          const cur =
            stats.get(link.entry_id) ??
            { count: 0, total: 0, lastDate: null as string | null, firstDate: null as string | null };
          cur.count += 1;
          cur.total += s.duration_minutes ?? 0;
          if (!cur.lastDate || s.session_date > cur.lastDate) cur.lastDate = s.session_date;
          if (!cur.firstDate || s.session_date < cur.firstDate) cur.firstDate = s.session_date;
          stats.set(link.entry_id, cur);
        }
      }

      for (const e of entries) {
        const st = stats.get(e.id);
        if (!e.data) e.data = {};
        for (const sp of statProps) {
          let value: unknown = null;
          if (st) {
            switch (sp.stat_kind) {
              case 'count':
                value = st.count;
                break;
              case 'total_min':
                value = st.total;
                break;
              case 'avg_min':
                value = st.count > 0 ? Math.round(st.total / st.count) : 0;
                break;
              case 'last_date':
                value = st.lastDate;
                break;
              case 'first_date':
                value = st.firstDate;
                break;
            }
          } else {
            value =
              sp.stat_kind === 'count' || sp.stat_kind === 'total_min' || sp.stat_kind === 'avg_min'
                ? 0
                : null;
          }
          e.data[sp.key] = value;
        }
      }
    }

    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

// POST — 새 항목
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    // collection 의 household_id 가져오기
    const { data: col } = await supabase
      .from('archive_collections')
      .select('household_id')
      .eq('id', id)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    const insert = {
      collection_id: id,
      household_id: col.household_id ?? DEFAULT_HOUSEHOLD_ID,
      data: body.data ?? {},
      member_id: body.member_id ?? null,
    };
    const { data, error } = await supabase
      .from('archive_entries')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
