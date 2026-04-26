export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { syncNotionSource } from '@/lib/notion-todo-sync';

// POST — 가져오기 실행 (수동, throttle 무시)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: source, error: srcErr } = await supabase
      .from('todo_notion_sources')
      .select('*')
      .eq('id', id)
      .single();
    if (srcErr || !source) {
      return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 });
    }
    const result = await syncNotionSource(supabase, source);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[POST /todo/notion-sources/:id/import]', error);
    return NextResponse.json(
      { error: error?.message ?? '가져오기 실패' },
      { status: 500 },
    );
  }
}
