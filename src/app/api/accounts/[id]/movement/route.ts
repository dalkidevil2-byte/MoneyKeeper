export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

/**
 * POST /api/accounts/[id]/movement
 * body: {
 *   kind: 'deposit' | 'withdraw' | 'transfer',
 *   amount: number,
 *   account_to_id?: string,  // transfer 시 대상 계좌
 *   name?: string,
 *   memo?: string,
 *   date?: string YYYY-MM-DD,
 *   category_main?: string,
 *   category_sub?: string,
 * }
 *
 * 계좌의 입금/출금/이체를 한 번에 처리. transactions insert + balance 자동 업데이트.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json();
    const kind = body.kind as 'deposit' | 'withdraw' | 'transfer';
    const amount = Math.round(Number(body.amount ?? 0));
    if (!['deposit', 'withdraw', 'transfer'].includes(kind)) {
      return NextResponse.json({ error: 'kind 잘못됨' }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount > 0 필요' }, { status: 400 });
    }

    const { data: acc } = await supabase
      .from('accounts')
      .select('id, household_id, name, type')
      .eq('id', id)
      .single();
    if (!acc) return NextResponse.json({ error: '계좌 없음' }, { status: 404 });

    const isPoints = acc.type === 'points';
    const date = (body.date as string) ?? dayjs().format('YYYY-MM-DD');
    const memo = (body.memo as string | undefined) ?? '';
    const baseName =
      kind === 'deposit'
        ? isPoints
          ? '포인트 적립'
          : '입금'
        : kind === 'withdraw'
          ? isPoints
            ? '포인트 사용'
            : '출금'
          : '계좌 이체';

    const insertTx: Record<string, unknown> = {
      household_id: acc.household_id,
      date,
      amount,
      name: (body.name as string | undefined)?.trim() || baseName,
      memo,
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      status: 'reviewed',
      input_type: 'manual',
    };

    if (kind === 'deposit') {
      insertTx.type = 'income';
      insertTx.account_to_id = id;
    } else if (kind === 'withdraw') {
      insertTx.type = 'variable_expense';
      insertTx.account_from_id = id;
    } else {
      // transfer
      const toId = body.account_to_id as string | undefined;
      if (!toId) {
        return NextResponse.json(
          { error: 'transfer 시 account_to_id 필요' },
          { status: 400 },
        );
      }
      if (toId === id) {
        return NextResponse.json(
          { error: '같은 계좌로는 이체할 수 없어요' },
          { status: 400 },
        );
      }
      insertTx.type = 'transfer';
      insertTx.account_from_id = id;
      insertTx.account_to_id = toId;
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert(insertTx)
      .select('*')
      .single();
    if (error) throw error;

    // 잔액 업데이트 (transactions API 의 updateAccountBalances 와 동일 로직)
    if (kind === 'deposit') {
      await supabase.rpc('increment_balance', { account_id: id, amount });
    } else if (kind === 'withdraw') {
      await supabase.rpc('decrement_balance', { account_id: id, amount });
    } else {
      await supabase.rpc('decrement_balance', { account_id: id, amount });
      await supabase.rpc('increment_balance', {
        account_id: body.account_to_id,
        amount,
      });
    }

    return NextResponse.json({ ok: true, transaction: data });
  } catch (e) {
    console.error('[POST /accounts/[id]/movement]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
