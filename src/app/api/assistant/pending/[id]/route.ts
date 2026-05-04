export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/assistant/pending/[id]
 * body: { action: 'confirm' | 'cancel' }
 *
 * 텔레그램과 동일한 telegram_pending_actions 테이블 재사용.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const { action } = await req.json();
    if (!['confirm', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'action 은 confirm 또는 cancel' },
        { status: 400 },
      );
    }

    const { data: pending } = await supabase
      .from('telegram_pending_actions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!pending) {
      return NextResponse.json({ error: '요청을 찾을 수 없음' }, { status: 404 });
    }
    if (pending.status !== 'pending') {
      return NextResponse.json({
        ok: false,
        error: `이미 처리됨 (${pending.status})`,
      });
    }
    if (new Date(pending.expires_at as string).getTime() < Date.now()) {
      await supabase
        .from('telegram_pending_actions')
        .update({ status: 'expired' })
        .eq('id', id);
      return NextResponse.json({ ok: false, error: '시간 초과로 만료됨' });
    }

    if (action === 'cancel') {
      await supabase
        .from('telegram_pending_actions')
        .update({ status: 'cancelled' })
        .eq('id', id);
      return NextResponse.json({ ok: true, status: 'cancelled' });
    }

    // confirm
    if (pending.kind === 'stock_trades_import') {
      const payload = pending.payload as {
        trades: Array<{
          account_id?: string;
          ticker: string;
          company_name?: string;
          type: 'BUY' | 'SELL';
          date: string;
          quantity: number;
          price: number;
          fee: number;
          tax: number;
        }>;
      };
      let inserted = 0;
      const failed: string[] = [];
      for (const t of payload.trades) {
        if (!t.account_id) {
          failed.push(`${t.company_name || t.ticker}: 계좌 미지정`);
          continue;
        }
        const { error } = await supabase.from('stock_transactions').insert({
          account_id: t.account_id,
          ticker: t.ticker,
          company_name: t.company_name ?? '',
          type: t.type,
          date: t.date,
          quantity: t.quantity,
          price: t.price,
          fee: t.fee,
          tax: t.tax,
          memo: '🤖 AI 어시스턴트 OCR',
        });
        if (error) failed.push(`${t.company_name || t.ticker}: ${error.message}`);
        else inserted++;
      }
      await supabase
        .from('telegram_pending_actions')
        .update({ status: 'confirmed' })
        .eq('id', id);
      return NextResponse.json({ ok: true, inserted, failed });
    }

    return NextResponse.json({ error: '지원하지 않는 종류' }, { status: 400 });
  } catch (e) {
    console.error('[assistant/pending]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '오류' },
      { status: 500 },
    );
  }
}
