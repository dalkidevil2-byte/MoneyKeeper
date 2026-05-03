export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

/**
 * POST /api/accounts/[id]/adjust
 * body: { actual_balance: number, note?: string }
 *
 * 입력된 실제 잔고와 시스템 잔고의 차이를 type='adjustment' 거래로 기록하고
 * 계좌 balance 를 입력값과 일치시킨다.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json();
    const target = Math.round(Number(body.actual_balance ?? 0));
    if (!Number.isFinite(target)) {
      return NextResponse.json({ error: 'actual_balance 필수' }, { status: 400 });
    }

    const { data: acc, error: getErr } = await supabase
      .from('accounts')
      .select('id, name, balance, household_id, type')
      .eq('id', id)
      .single();
    if (getErr || !acc) {
      return NextResponse.json({ error: '계좌 없음' }, { status: 404 });
    }

    const current = Number(acc.balance ?? 0);
    const diff = target - current;
    if (diff === 0) {
      return NextResponse.json({ ok: true, no_change: true, current, target });
    }

    const today = dayjs().format('YYYY-MM-DD');
    const memoFallback = `${current.toLocaleString('ko-KR')} → ${target.toLocaleString('ko-KR')}`;
    const insertTx = {
      household_id: acc.household_id,
      date: today,
      type: 'adjustment' as const,
      amount: Math.abs(diff),
      name: '잔액 보정',
      memo: (body.note as string | undefined)?.trim() || memoFallback,
      account_from_id: diff < 0 ? id : null,
      account_to_id: diff > 0 ? id : null,
      status: 'reviewed' as const,
      input_type: 'manual' as const,
    };
    const { error: insErr } = await supabase.from('transactions').insert(insertTx);
    if (insErr) throw insErr;

    const { error: updErr } = await supabase
      .from('accounts')
      .update({ balance: target })
      .eq('id', id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, diff, current, target });
  } catch (e) {
    console.error('[POST /accounts/[id]/adjust]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
