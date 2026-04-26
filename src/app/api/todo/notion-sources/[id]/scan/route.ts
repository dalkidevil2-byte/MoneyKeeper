export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { scanNotionDatabase } from '@/lib/notion-todo';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data: source, error } = await supabase
      .from('todo_notion_sources')
      .select('notion_token, database_id')
      .eq('id', id)
      .single();
    if (error || !source) {
      return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 });
    }
    const scan = await scanNotionDatabase(source.notion_token, source.database_id);
    return NextResponse.json({ scan });
  } catch (e: any) {
    console.error('[scan]', e);
    return NextResponse.json(
      { error: e?.message ?? '스캔 실패' },
      { status: 500 },
    );
  }
}
