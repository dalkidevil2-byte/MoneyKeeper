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
    return NextResponse.json({ entries: data ?? [] });
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
