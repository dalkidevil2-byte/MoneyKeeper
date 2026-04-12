import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/budgets - 현재 월 예산 + 사용금액 조회
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const today = dayjs();
  const startOfMonth = today.startOf('month').format('YYYY-MM-DD');
  const endOfMonth = today.endOf('month').format('YYYY-MM-DD');

  // 이번 달 예산 조회
  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('household_id', householdId)
    .gte('end_date', startOfMonth)
    .lte('start_date', endOfMonth);

  if (budgetError) return NextResponse.json({ error: budgetError.message }, { status: 500 });

  // 이번 달 지출 합계 (transfer 제외)
  const { data: expenses, error: expError } = await supabase
    .from('transactions')
    .select('amount, payment_method_id, account_from_id')
    .eq('household_id', householdId)
    .in('type', ['variable_expense', 'fixed_expense'])
    .neq('status', 'cancelled')
    .gte('date', startOfMonth)
    .lte('date', endOfMonth);

  if (expError) return NextResponse.json({ error: expError.message }, { status: 500 });

  const totalExpense = (expenses ?? []).reduce((sum, t) => sum + t.amount, 0);

  // 소비 속도 계산 (오늘이 몇 번째 날인지)
  const dayOfMonth = today.date();
  const totalDays = today.daysInMonth();
  const expectedRate = dayOfMonth / totalDays;

  const budgetsWithUsage = (budgets ?? []).map((budget) => {
    // 예산 연결 카드/계좌 기준 지출만 필터 (연결 없으면 전체)
    let usedAmount = totalExpense;
    if (budget.payment_method_id) {
      usedAmount = (expenses ?? [])
        .filter((e) => e.payment_method_id === budget.payment_method_id)
        .reduce((sum, e) => sum + e.amount, 0);
    } else if (budget.account_id) {
      usedAmount = (expenses ?? [])
        .filter((e) => e.account_from_id === budget.account_id)
        .reduce((sum, e) => sum + e.amount, 0);
    }

    const usageRate = budget.amount > 0 ? usedAmount / budget.amount : 0;
    const projectedAmount = expectedRate > 0 ? usedAmount / expectedRate : 0;
    const projectedOverage = projectedAmount > budget.amount;

    let warningLevel = 'none';
    if (usageRate >= 1.0) warningLevel = 'warning_100';
    else if (usageRate >= 0.9) warningLevel = 'warning_90';
    else if (usageRate >= 0.8) warningLevel = 'warning_80';

    return {
      ...budget,
      used_amount: usedAmount,
      usage_rate: Math.round(usageRate * 100),
      warning_level: warningLevel,
      projected_overage: projectedOverage,
    };
  });

  return NextResponse.json({ budgets: budgetsWithUsage });
}

// POST /api/budgets - 예산 생성
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  const today = dayjs();
  const startDate = body.start_date ?? today.startOf('month').format('YYYY-MM-DD');
  const endDate = body.end_date ?? today.endOf('month').format('YYYY-MM-DD');

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      name: body.name ?? '생활비 예산',
      period_type: 'monthly',
      start_date: startDate,
      end_date: endDate,
      amount: body.amount,
      account_id: body.account_id ?? null,
      payment_method_id: body.payment_method_id ?? null,
      category_main: body.category_main ?? '',
      is_total: body.is_total ?? false,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ budget: data }, { status: 201 });
}
