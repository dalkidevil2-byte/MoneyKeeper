export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/stocks/memos/move
 * body: { household_id?, from_ticker, to_ticker }
 * from 의 메모 content 를 to 로 옮김 (to 에 기존 메모가 있으면 prepend).
 * from row 는 삭제. ticker 잘못 매칭됐을 때 사용자가 정정하기 위함.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const from = String(body.from_ticker ?? '').trim();
    const to = String(body.to_ticker ?? '').trim();

    if (!from || !to) {
      return NextResponse.json(
        { error: 'from_ticker, to_ticker 가 필요합니다.' },
        { status: 400 },
      );
    }
    if (from === to) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const { data: fromRow } = await supabase
      .from('stock_memos')
      .select('content')
      .eq('household_id', householdId)
      .eq('ticker', from)
      .maybeSingle();

    if (!fromRow) {
      return NextResponse.json({ error: '원본 메모를 찾지 못했어요.' }, { status: 404 });
    }

    const { data: toRow } = await supabase
      .from('stock_memos')
      .select('content')
      .eq('household_id', householdId)
      .eq('ticker', to)
      .maybeSingle();

    const merged = toRow?.content
      ? `${fromRow.content}\n\n---\n\n${toRow.content}`
      : (fromRow.content ?? '');

    // upsert to
    const { error: upErr } = await supabase
      .from('stock_memos')
      .upsert(
        { household_id: householdId, ticker: to, content: merged },
        { onConflict: 'household_id,ticker' },
      );
    if (upErr) throw upErr;

    // delete from
    const { error: delErr } = await supabase
      .from('stock_memos')
      .delete()
      .eq('household_id', householdId)
      .eq('ticker', from);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, to_ticker: to });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '이동 실패' },
      { status: 500 },
    );
  }
}
