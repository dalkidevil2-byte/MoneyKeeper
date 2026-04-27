export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — task 의 모든 세션
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const { data, error } = await supabase
      .from('task_work_sessions')
      .select('*')
      .eq('task_id', id)
      .order('session_date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// POST — 세션 추가  body: { session_date, start_time?, end_time?, note? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const sessionDate = body.session_date as string | undefined;
    if (!sessionDate) {
      return NextResponse.json({ error: 'session_date 필요' }, { status: 400 });
    }
    const { data: task } = await supabase
      .from('tasks')
      .select('household_id')
      .eq('id', id)
      .maybeSingle();
    const insert = {
      task_id: id,
      household_id: task?.household_id ?? DEFAULT_HOUSEHOLD_ID,
      session_date: sessionDate,
      start_time: body.start_time ?? null,
      end_time: body.end_time ?? null,
      note: body.note ?? '',
      expense_amount: body.expense_amount ?? null,
      expense_category_main: body.expense_category_main ?? '',
      expense_category_sub: body.expense_category_sub ?? '',
      expense_account_id: body.expense_account_id ?? null,
      expense_payment_method_id: body.expense_payment_method_id ?? null,
    };
    const { data, error } = await supabase
      .from('task_work_sessions')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ session: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// PATCH — 한 세션 수정  body: { session_id, ... }
export async function PATCH(
  req: NextRequest,
  { params: _p }: { params: Promise<{ id: string }> },
) {
  await _p;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const sessionId = body.session_id as string | undefined;
    if (!sessionId) {
      return NextResponse.json({ error: 'session_id 필요' }, { status: 400 });
    }
    const allowed = [
      'session_date', 'start_time', 'end_time', 'note', 'is_done',
      'expense_amount', 'expense_category_main', 'expense_category_sub',
      'expense_account_id', 'expense_payment_method_id', 'expense_transaction_id',
    ] as const;
    const update: Record<string, unknown> = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
    }
    if (typeof body.is_done === 'boolean') {
      update.done_at = body.is_done ? new Date().toISOString() : null;
    }
    const { data, error } = await supabase
      .from('task_work_sessions')
      .update(update)
      .eq('id', sessionId)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ session: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}

// DELETE  ?session_id=...
export async function DELETE(
  req: NextRequest,
  { params: _p }: { params: Promise<{ id: string }> },
) {
  await _p;
  const supabase = createServerSupabaseClient();
  const sessionId = new URL(req.url).searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id 필요' }, { status: 400 });
  }
  try {
    const { error } = await supabase
      .from('task_work_sessions')
      .delete()
      .eq('id', sessionId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '실패' }, { status: 500 });
  }
}
