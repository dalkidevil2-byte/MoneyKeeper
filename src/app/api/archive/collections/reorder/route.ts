export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/archive/collections/reorder
 * body: { household_id?, ids: string[] }  // 새 순서대로 collection id 배열
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, updated: 0 });
    }
    const updates = ids.map((collectionId, index) =>
      supabase
        .from('archive_collections')
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq('id', collectionId)
        .eq('household_id', householdId),
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
