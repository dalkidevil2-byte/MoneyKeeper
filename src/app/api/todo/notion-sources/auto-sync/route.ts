export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { syncNotionSource } from '@/lib/notion-todo-sync';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const THROTTLE_MIN = 30;

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const force = new URL(req.url).searchParams.get('force') === '1';

  try {
    const { data: sources } = await supabase
      .from('todo_notion_sources')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true);

    const now = Date.now();
    const results: { id: string; name: string; status: string; counts?: any }[] = [];

    for (const s of sources ?? []) {
      if (!force && s.last_imported_at) {
        const last = new Date(s.last_imported_at).getTime();
        const diffMin = (now - last) / 60000;
        if (diffMin < THROTTLE_MIN) {
          results.push({ id: s.id, name: s.name, status: 'throttled' });
          continue;
        }
      }
      try {
        const counts = await syncNotionSource(supabase, s);
        results.push({ id: s.id, name: s.name, status: 'ok', counts });
      } catch (e: any) {
        console.error('[auto-sync source]', s.name, e);
        results.push({
          id: s.id,
          name: s.name,
          status: 'error',
          counts: { error: e?.message ?? String(e) },
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[auto-sync]', error);
    return NextResponse.json({ error: error?.message ?? '실패' }, { status: 500 });
  }
}
