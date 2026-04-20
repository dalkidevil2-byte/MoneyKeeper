export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { createNotionPage, type ItemForNotion } from '@/lib/notion';
import type { CreateTransactionInput } from '@/types';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// ─────────────────────────────────────────
// GET /api/transactions - 거래 목록 조회
// ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);

  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const memberId = searchParams.get('member_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const type = searchParams.get('type');
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        member:members!member_id(id, name, color),
        target_member:members!target_member_id(id, name, color),
        account_from:accounts!account_from_id(id, name, type),
        account_to:accounts!account_to_id(id, name, type),
        payment_method:payment_methods(id, name, type)
      `)
      .eq('household_id', householdId)
      .neq('status', 'cancelled')
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (memberId) query = query.eq('member_id', memberId);
    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);
    if (type) query = query.eq('type', type);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({ transactions: data, total: count });
  } catch (error) {
    console.error('[GET /transactions]', error);
    return NextResponse.json({ error: '거래 내역을 불러오지 못했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// POST /api/transactions - 거래 생성
// ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const body: CreateTransactionInput = await req.json();

    // 필수값 검증
    if (!body.amount || body.amount <= 0) {
      return NextResponse.json({ error: '금액을 올바르게 입력해주세요.' }, { status: 400 });
    }
    if (!body.date) {
      return NextResponse.json({ error: '날짜를 입력해주세요.' }, { status: 400 });
    }
    // transfer 검증
    if (body.type === 'transfer' && (!body.account_from_id || !body.account_to_id)) {
      return NextResponse.json(
        { error: '자금 이동은 출금 계좌와 입금 계좌를 모두 지정해야 합니다.' },
        { status: 400 }
      );
    }

    // target_member_ids 우선, 없으면 단일 target_member_id를 배열화
    const targetIds: string[] = Array.isArray(body.target_member_ids)
      ? body.target_member_ids.filter(Boolean)
      : body.target_member_id
        ? [body.target_member_id]
        : [];

    const insertData = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      member_id: body.member_id ?? null,
      target_member_id: targetIds[0] ?? null,            // 호환용 단일 값 (첫 번째)
      target_member_ids: targetIds,                       // 새 다중 값
      receipt_url: body.receipt_url ?? '',
      date: body.date,
      type: body.type ?? 'variable_expense',
      amount: body.amount,
      name: body.name ?? '',
      merchant_name: body.merchant_name ?? '',
      account_from_id: body.account_from_id ?? null,
      account_to_id: body.account_to_id ?? null,
      payment_method_id: body.payment_method_id ?? null,
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      memo: body.memo ?? '',
      tags: body.tags ?? [],
      essential: body.essential ?? false,
      input_type: body.input_type ?? 'text',
      raw_input: body.raw_input ?? '',
      status: 'reviewed' as const,
      sync_status: 'pending' as const,
    };

    const { data, error } = await supabase
      .from('transactions')
      .insert(insertData)
      .select(`
        *,
        member:members!member_id(id, name, color),
        target_member:members!target_member_id(id, name, color),
        account_from:accounts!account_from_id(id, name, type),
        account_to:accounts!account_to_id(id, name, type),
        payment_method:payment_methods(id, name, type)
      `)
      .single();

    if (error) throw error;

    // 계좌 잔액 업데이트
    await updateAccountBalances(supabase, data);

    // Notion 자동 동기화 (fire-and-forget — 실패해도 거래 저장은 성공)
    // NOTE: await 하지 않음으로써 응답 지연 최소화
    syncToNotion(supabase, data).catch((e) =>
      console.error('[Notion auto-sync]', e)
    );

    return NextResponse.json({ transaction: data }, { status: 201 });
  } catch (error) {
    console.error('[POST /transactions]', error);
    return NextResponse.json({ error: '거래 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// 계좌 잔액 업데이트
// ─────────────────────────────────────────
async function updateAccountBalances(supabase: ReturnType<typeof createServerSupabaseClient>, tx: any) {
  try {
    if (tx.type === 'transfer') {
      // 이동: from 차감, to 증가
      if (tx.account_from_id) {
        await supabase.rpc('decrement_balance', { account_id: tx.account_from_id, amount: tx.amount });
      }
      if (tx.account_to_id) {
        await supabase.rpc('increment_balance', { account_id: tx.account_to_id, amount: tx.amount });
      }
    } else if (tx.type === 'income') {
      // 수입: to 증가
      if (tx.account_to_id) {
        await supabase.rpc('increment_balance', { account_id: tx.account_to_id, amount: tx.amount });
      }
    } else if (['variable_expense', 'fixed_expense'].includes(tx.type)) {
      // 지출 (체크카드/현금): from 차감
      if (tx.account_from_id) {
        await supabase.rpc('decrement_balance', { account_id: tx.account_from_id, amount: tx.amount });
      }
    }
  } catch (err) {
    console.error('[잔액 업데이트 실패]', err);
    // 잔액 오류는 거래 저장에 영향 없음
  }
}

// ─────────────────────────────────────────
// Notion 동기화 (fire-and-forget)
// ─────────────────────────────────────────
async function syncToNotion(supabase: ReturnType<typeof createServerSupabaseClient>, tx: any) {
  try {
    // 생성 직후엔 items가 아직 없을 가능성이 높지만 혹시 있으면 포함
    const { data: items } = await supabase
      .from('items')
      .select('name, quantity, price, unit, category_main, category_sub')
      .eq('transaction_id', tx.id);
    const notionPageId = await createNotionPage(tx, (items ?? []) as ItemForNotion[]);

    if (notionPageId) {
      await supabase
        .from('transactions')
        .update({
          notion_page_id: notionPageId,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', tx.id);
    } else {
      await supabase
        .from('transactions')
        .update({ sync_status: 'failed' })
        .eq('id', tx.id);
    }
  } catch {
    await supabase
      .from('transactions')
      .update({ sync_status: 'failed' })
      .eq('id', tx.id);
  }
}
