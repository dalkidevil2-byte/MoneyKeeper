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
// end_time < start_time (자정 넘김) 이면 자동으로 두 세션으로 분할.
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
    const householdId = task?.household_id ?? DEFAULT_HOUSEHOLD_ID;

    const startTime: string | null = body.start_time ?? null;
    const endTime: string | null = body.end_time ?? null;

    // 자정 넘김 감지: 둘 다 있고 end < start 면 분할
    const crossesMidnight =
      !!startTime &&
      !!endTime &&
      // HH:MM 또는 HH:MM:SS 비교는 문자열로 가능 (ISO 형식)
      String(endTime) < String(startTime);

    const baseInsert = {
      task_id: id,
      household_id: householdId,
      note: body.note ?? '',
      expense_amount: body.expense_amount ?? null,
      expense_category_main: body.expense_category_main ?? '',
      expense_category_sub: body.expense_category_sub ?? '',
      expense_account_id: body.expense_account_id ?? null,
      expense_payment_method_id: body.expense_payment_method_id ?? null,
    };

    if (crossesMidnight) {
      // 시작일: start ~ 23:59:59
      const dateObj = new Date(sessionDate + 'T00:00:00');
      dateObj.setDate(dateObj.getDate() + 1);
      const nextDate = dateObj.toISOString().slice(0, 10);

      const inserts = [
        {
          ...baseInsert,
          session_date: sessionDate,
          start_time: startTime,
          end_time: '23:59:59',
        },
        {
          ...baseInsert,
          session_date: nextDate,
          start_time: '00:00:00',
          end_time: endTime,
          note: baseInsert.note ? `${baseInsert.note} (자정 분할)` : '(자정 분할)',
        },
      ];

      const { data, error } = await supabase
        .from('task_work_sessions')
        .insert(inserts)
        .select('*');
      if (error) throw error;
      // 첫 세션 반환 (호출자 호환)
      return NextResponse.json(
        { session: data?.[0], sessions: data, split: true },
        { status: 201 },
      );
    }

    const insert = {
      ...baseInsert,
      session_date: sessionDate,
      start_time: startTime,
      end_time: endTime,
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
// end_time < start_time 으로 수정하면 자동 분할 (start~23:59 + 다음날 00:00~end)
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

    // 자정 넘김 감지: 새 start/end 또는 기존 값과 조합으로 end<start 면 split
    const newStart = (update.start_time as string | undefined) ?? null;
    const newEnd = (update.end_time as string | undefined) ?? null;
    if (newStart != null && newEnd != null && String(newEnd) < String(newStart)) {
      // 기존 세션 정보 (session_date, household_id, task_id) 가져오기
      const { data: existing } = await supabase
        .from('task_work_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();
      if (!existing) {
        return NextResponse.json({ error: '세션 없음' }, { status: 404 });
      }
      const sessionDate = (update.session_date as string) ?? (existing.session_date as string);
      const dateObj = new Date(sessionDate + 'T00:00:00');
      dateObj.setDate(dateObj.getDate() + 1);
      const nextDate = dateObj.toISOString().slice(0, 10);

      // ① 기존 세션은 start~23:59:59 로 마감
      const firstUpdate = { ...update, end_time: '23:59:59', session_date: sessionDate };
      const { error: e1 } = await supabase
        .from('task_work_sessions')
        .update(firstUpdate)
        .eq('id', sessionId);
      if (e1) throw e1;

      // ② 다음날 새 세션 추가
      const { data: secondData, error: e2 } = await supabase
        .from('task_work_sessions')
        .insert({
          task_id: existing.task_id,
          household_id: existing.household_id,
          session_date: nextDate,
          start_time: '00:00:00',
          end_time: newEnd,
          note:
            existing.note ? `${existing.note} (자정 분할)` : '(자정 분할)',
        })
        .select('*')
        .single();
      if (e2) throw e2;

      const { data: firstData } = await supabase
        .from('task_work_sessions')
        .select('*')
        .eq('id', sessionId)
        .maybeSingle();

      return NextResponse.json({
        session: firstData,
        second_session: secondData,
        split: true,
      });
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
