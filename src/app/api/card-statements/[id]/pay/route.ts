export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

/**
 * POST /api/card-statements/[id]/pay
 * 청구서를 "결제 완료" 처리하고, 출금 계좌에서 transfer 거래를 생성한다.
 * body: { account_id?: string, paid_on?: 'YYYY-MM-DD' }
 *   - account_id 없으면 statement.account_id 사용
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json().catch(() => ({}));
    const { data: stmt, error: getErr } = await supabase
      .from('card_statements')
      .select(
        `*, payment_method:payment_methods(id, name)`,
      )
      .eq('id', id)
      .single();
    if (getErr || !stmt) {
      return NextResponse.json({ error: '청구서 없음' }, { status: 404 });
    }
    if (stmt.status === 'paid') {
      return NextResponse.json(
        { error: '이미 결제 완료된 청구서' },
        { status: 400 },
      );
    }

    const accountId =
      (body.account_id as string | undefined) ?? (stmt.account_id as string | null);
    if (!accountId) {
      return NextResponse.json({ error: '출금 계좌 필요' }, { status: 400 });
    }
    const paidOn = (body.paid_on as string | undefined) ?? dayjs().format('YYYY-MM-DD');
    const amount = Math.round(Number(stmt.billed_amount));

    // transfer 거래 생성 (계좌에서 출금 → 카드 결제)
    const pmName =
      (stmt.payment_method as { name?: string } | null)?.name ?? '카드';
    const period = `${stmt.billing_period_start} ~ ${stmt.billing_period_end}`;
    const { data: tx, error: txErr } = await supabase
      .from('transactions')
      .insert({
        household_id: stmt.household_id,
        date: paidOn,
        type: 'variable_expense', // 출금 처리 (지출로 잡지 않으려면 transfer 로 변경 가능)
        amount,
        name: `${pmName} 결제`,
        memo: `청구기간 ${period}`,
        account_from_id: accountId,
        category_main: '카드결제',
        status: 'reviewed',
        input_type: 'manual',
      })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // 잔액 차감
    await supabase.rpc('decrement_balance', {
      account_id: accountId,
      amount,
    });

    // 청구서 상태 업데이트
    const { data: updated, error: updErr } = await supabase
      .from('card_statements')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_transaction_id: tx.id,
        account_id: accountId,
      })
      .eq('id', id)
      .select(
        `*, payment_method:payment_methods(id, name, type), account:accounts!account_id(id, name)`,
      )
      .single();
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true, statement: updated, transaction_id: tx.id });
  } catch (e) {
    console.error('[POST /card-statements/[id]/pay]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
