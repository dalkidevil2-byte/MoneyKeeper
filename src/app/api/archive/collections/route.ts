export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 컬렉션 목록 + 항목 수
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    const { data: collections, error } = await supabase
      .from('archive_collections')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    if (!collections || collections.length === 0) {
      return NextResponse.json({ collections: [] });
    }

    // 항목 수 카운트
    const ids = collections.map((c) => c.id as string);
    const { data: counts } = await supabase
      .from('archive_entries')
      .select('collection_id', { count: 'exact' })
      .in('collection_id', ids);
    const countMap = new Map<string, number>();
    for (const r of counts ?? []) {
      const k = r.collection_id as string;
      countMap.set(k, (countMap.get(k) ?? 0) + 1);
    }

    return NextResponse.json({
      collections: collections.map((c) => ({
        ...c,
        entry_count: countMap.get(c.id as string) ?? 0,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

// POST — 새 컬렉션
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    if (!body.name) {
      return NextResponse.json({ error: 'name 필요' }, { status: 400 });
    }
    const insert = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      name: body.name.trim(),
      emoji: body.emoji ?? '📦',
      color: body.color ?? '#6366f1',
      description: body.description ?? '',
      schema: body.schema ?? [],
      is_active: true,
    };
    const { data, error } = await supabase
      .from('archive_collections')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ collection: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
