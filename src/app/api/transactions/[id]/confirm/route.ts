export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { syncTransactionToNotion } from '@/lib/notion-sync';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  const { error } = await supabase
    .from('transactions')
    .update({ status: 'confirmed' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 확인과 동시에 Notion 동기화까지 끝낸다.
  // Inbox 는 '동기화 안 된 거래' 를 보여주므로, 여기서 동기화하지 않으면
  // 확인을 눌러도 항목이 'Notion 대기' 로 계속 남는다.
  // 실패해도 확인 자체는 성공으로 응답한다 (sync_status='failed' 로 남아 재시도 가능).
  const sync = await syncTransactionToNotion(supabase, id);

  return NextResponse.json({ ok: true, sync });
}
