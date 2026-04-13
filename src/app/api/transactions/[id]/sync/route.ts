export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createNotionPage } from '@/lib/notion';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  // 거래 조회
  const { data: tx, error } = await supabase
    .from('transactions')
    .select(`*, member:members!member_id(id, name, color), payment_method:payment_methods(id, name, type)`)
    .eq('id', id)
    .single();

  if (error || !tx) return NextResponse.json({ error: '거래를 찾을 수 없어요' }, { status: 404 });

  try {
    const notionPageId = await createNotionPage(tx);
    if (notionPageId) {
      await supabase.from('transactions').update({
        notion_page_id: notionPageId,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      }).eq('id', id);
      return NextResponse.json({ success: true, notion_page_id: notionPageId });
    } else {
      await supabase.from('transactions').update({ sync_status: 'failed' }).eq('id', id);
      return NextResponse.json({ error: 'Notion 동기화 실패. 설정을 확인해주세요.' }, { status: 500 });
    }
  } catch (e: any) {
    await supabase.from('transactions').update({ sync_status: 'failed' }).eq('id', id);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
