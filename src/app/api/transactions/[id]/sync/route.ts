export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { syncTransactionToNotion } from '@/lib/notion-sync';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const result = await syncTransactionToNotion(supabase, id);

  if (result === 'not_found') {
    return NextResponse.json({ error: '거래를 찾을 수 없어요' }, { status: 404 });
  }
  if (result === 'failed') {
    return NextResponse.json({ error: 'Notion 동기화 실패. 설정을 확인해주세요.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
