export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET /api/card-statements?household_id=&payment_method_id=&status=
 * 청구 기간에 해당하는 거래 합계(recorded_amount)도 같이 계산해서 응답.
 */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const pmId = searchParams.get('payment_method_id');
  const status = searchParams.get('status');

  try {
    let q = supabase
      .from('card_statements')
      .select(
        `*, payment_method:payment_methods(id, name, type), account:accounts!account_id(id, name)`,
      )
      .eq('household_id', householdId)
      .order('payment_due_date', { ascending: false });
    if (pmId) q = q.eq('payment_method_id', pmId);
    if (status) q = q.eq('status', status);
    const { data: stmts, error } = await q;
    if (error) throw error;

    type Stmt = {
      id: string;
      payment_method_id: string;
      billing_period_start: string;
      billing_period_end: string;
      billed_amount: number;
    };
    const list = (stmts ?? []) as Array<Stmt & Record<string, unknown>>;
    if (list.length === 0) return NextResponse.json({ statements: [] });

    // 각 청구서별로 등록된 거래 합계 조회 (한 번에 모음)
    const enriched = await Promise.all(
      list.map(async (s) => {
        const { data: txs } = await supabase
          .from('transactions')
          .select('amount')
          .eq('household_id', householdId)
          .eq('payment_method_id', s.payment_method_id)
          .gte('date', s.billing_period_start)
          .lte('date', s.billing_period_end)
          .neq('status', 'cancelled')
          .in('type', ['variable_expense', 'fixed_expense']);
        const recorded = (txs ?? []).reduce(
          (sum, t) => sum + Number((t as { amount: number }).amount ?? 0),
          0,
        );
        return {
          ...s,
          recorded_amount: recorded,
          diff: Number(s.billed_amount) - recorded,
        };
      }),
    );

    return NextResponse.json({ statements: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/card-statements
 * body: { payment_method_id, billing_period_start, billing_period_end,
 *         payment_due_date, billed_amount, account_id?, memo? }
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const required = [
      'payment_method_id',
      'billing_period_start',
      'billing_period_end',
      'payment_due_date',
      'billed_amount',
    ];
    for (const k of required) {
      if (body[k] == null) {
        return NextResponse.json({ error: `${k} 필요` }, { status: 400 });
      }
    }

    const insert = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      payment_method_id: body.payment_method_id,
      billing_period_start: body.billing_period_start,
      billing_period_end: body.billing_period_end,
      payment_due_date: body.payment_due_date,
      billed_amount: Math.round(Number(body.billed_amount)),
      account_id: body.account_id ?? null,
      memo: body.memo ?? '',
      status: 'pending' as const,
    };
    const { data, error } = await supabase
      .from('card_statements')
      .insert(insert)
      .select(
        `*, payment_method:payment_methods(id, name, type), account:accounts!account_id(id, name)`,
      )
      .single();
    if (error) throw error;
    return NextResponse.json({ statement: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
