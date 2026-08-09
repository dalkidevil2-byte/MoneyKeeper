export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  parseBookingNotification,
  looksLikeBookingNotification,
  isAdvertisement,
  buildBookingKey,
} from '@/lib/booking-notification-parser';

// ─────────────────────────────────────────
// 폰에서 예약 확정 알림을 받아 일정(tasks)으로 등록.
//
//   폰(MacroDroid) → POST /api/tasks/notify?secret=<CARD_NOTIFY_SECRET>&member=성진
//     본문: 알림 원문 (text/plain) 또는 {"text": "..."}
//
// 카드 알림과 같은 비밀키를 쓴다 (폰에 값을 하나만 넣으면 되도록).
// member 는 폰마다 다르게 붙인다 — 예약 알림에는 누구 것인지 정보가 없기 때문.
// ─────────────────────────────────────────

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

async function readText(req: NextRequest): Promise<string> {
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title : '';
    const text = typeof body.text === 'string' ? body.text : '';
    return [title, text].filter(Boolean).join('\n');
  }
  return req.text();
}

export async function POST(req: NextRequest) {
  const expected = process.env.CARD_NOTIFY_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: 'CARD_NOTIFY_SECRET 이 설정되지 않아 비활성화되어 있습니다.' },
      { status: 503 },
    );
  }

  const provided =
    req.headers.get('x-notify-secret') ?? req.nextUrl.searchParams.get('secret');
  if (provided !== expected) {
    return NextResponse.json({ ok: false, error: '인증 실패' }, { status: 401 });
  }

  try {
    const rawText = await readText(req);
    if (!rawText.trim()) {
      return NextResponse.json({ ok: false, error: '내용이 비어 있습니다.' }, { status: 400 });
    }

    // 예약 알림이 아닌 것은 저장하지 않는다 (개인 대화 보호)
    if (!looksLikeBookingNotification(rawText)) {
      return NextResponse.json(
        { ok: true, status: 'ignored', reason: '예약 알림 형식이 아님' },
        { status: 200 },
      );
    }

    // "지금 예약하세요" 같은 광고는 일정으로 만들지 않는다
    if (isAdvertisement(rawText)) {
      return NextResponse.json(
        { ok: true, status: 'ignored', reason: '광고성 문구로 판단' },
        { status: 200 },
      );
    }

    const parsed = parseBookingNotification(rawText);
    if (!parsed.matched || !parsed.date || !parsed.startTime) {
      return NextResponse.json(
        { ok: true, status: 'unparsed', message: '아직 지원하지 않는 예약 알림 형식입니다.' },
        { status: 200 },
      );
    }

    const supabase = createServerSupabaseClient();
    const householdId = DEFAULT_HOUSEHOLD_ID;

    // 예약자 — 알림에는 누구 것인지 정보가 없어 URL 의 member 로 받는다.
    // 폰마다 다른 URL 을 쓰면 각자에게 달린다.
    const memberName = req.nextUrl.searchParams.get('member');
    let memberId: string | null = null;
    if (memberName) {
      const { data: m } = await supabase
        .from('members')
        .select('id')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .eq('name', memberName)
        .maybeSingle();
      memberId = m?.id ?? null;
    }

    // 같은 예약 알림이 두 번 와도 일정이 두 개 생기지 않게 한다.
    // (제목·날짜·시작시각이 같으면 같은 예약으로 본다)
    const { data: dup } = await supabase
      .from('tasks')
      .select('id')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .eq('title', parsed.title)
      .eq('due_date', parsed.date)
      .eq('due_time', parsed.startTime)
      .limit(1)
      .maybeSingle();

    if (dup) {
      return NextResponse.json(
        { ok: true, status: 'duplicate', task_id: dup.id },
        { status: 200 },
      );
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        household_id: householdId,
        kind: 'event',
        type: 'one_time',
        title: parsed.title,
        memo: parsed.memo,
        member_id: memberId,
        target_member_ids: memberId ? [memberId] : [],
        is_fixed: true, // 시간이 정해진 예약
        due_date: parsed.date,
        due_time: parsed.startTime,
        end_time: parsed.endTime,
        priority: 'normal',
        status: 'pending',
        is_active: true,
      })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        ok: true,
        status: 'created',
        task_id: task.id,
        parsed: {
          title: parsed.title,
          date: parsed.date,
          start: parsed.startTime,
          end: parsed.endTime,
          key: buildBookingKey(parsed),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[tasks/notify]', error);
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : '알 수 없는 오류';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
