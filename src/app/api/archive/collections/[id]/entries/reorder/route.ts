export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/archive/collections/[id]/entries/reorder
 * body: { ids: string[] }  // 새 순서대로 entry id 배열
 * 컬렉션 안 entry 들의 position 을 한번에 재할당.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }

    // 각 entry 의 position 을 인덱스로 업데이트 (collection 내 일관성 유지)
    const updates = ids.map((entryId, index) =>
      supabase
        .from('archive_entries')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('id', entryId)
        .eq('collection_id', id),
    );
    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: errors[0].error?.message ?? '일부 항목 업데이트 실패' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, updated: ids.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
