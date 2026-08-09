export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { inferCategory } from '@/lib/parser';
import {
  parseCardNotification,
  normalizeNotificationText,
  looksLikeCardNotification,
  isDuplicateSourceNotification,
  buildDedupeKey,
} from '@/lib/card-notification-parser';

// ─────────────────────────────────────────
// 폰에서 카드 결제 알림 원문을 받아 Inbox 거래로 적재.
//
//   폰(Automate/MacroDroid) → POST /api/transactions/notify
//     헤더: x-notify-secret: <CARD_NOTIFY_SECRET>
//     본문: {"text": "삼성1810승인 ...", "source": "kakao"}  또는 순수 텍스트
//
// 이 경로는 미들웨어 로그인 검사를 우회하므로(폰이 로그인할 수 없음),
// CARD_NOTIFY_SECRET 검증이 유일한 방어선이다. 시크릿이 없으면 아예 열지 않는다.
// ─────────────────────────────────────────

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

const PG_UNIQUE_VIOLATION = '23505';

function unauthorized(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

// Supabase 오류는 Error 인스턴스가 아니라 { message, code } 형태의 평범한 객체로 온다.
// instanceof Error 만 보면 원인이 '알 수 없는 오류' 로 뭉개져 진단이 어려워진다.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return '알 수 없는 오류';
}

async function readText(req: NextRequest): Promise<{ text: string; source: string }> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));
    // 알림 제목(발신자)에 카드사명이 들어있는 경우가 있어 본문 앞에 붙인다.
    const title = typeof body.title === 'string' ? body.title : '';
    const text = typeof body.text === 'string' ? body.text : '';
    const source = typeof body.source === 'string' ? body.source : 'unknown';
    return { text: [title, text].filter(Boolean).join('\n'), source };
  }

  // 자동화 앱이 JSON 을 못 만드는 경우 대비 — 순수 텍스트도 받는다.
  const raw = await req.text();
  return { text: raw, source: 'unknown' };
}

export async function POST(req: NextRequest) {
  // 1) 인증 — 시크릿 미설정 시 엔드포인트를 닫아둔다 (열린 채로 방치되는 것 방지)
  const expected = process.env.CARD_NOTIFY_SECRET;
  if (!expected) {
    return unauthorized(
      'CARD_NOTIFY_SECRET 이 설정되지 않아 이 기능이 비활성화되어 있습니다.',
      503,
    );
  }

  const provided =
    req.headers.get('x-notify-secret') ?? req.nextUrl.searchParams.get('secret');
  if (provided !== expected) {
    return unauthorized('인증 실패', 401);
  }

  try {
    const { text: rawText, source } = await readText(req);

    if (!rawText.trim()) {
      return NextResponse.json({ ok: false, error: '내용이 비어 있습니다.' }, { status: 400 });
    }

    // 2) 카드 알림이 아닌 것은 저장조차 하지 않는다.
    //    폰 설정이 잘못돼 개인 카톡이 넘어와도 DB 에 남지 않도록 하는 안전장치.
    if (!looksLikeCardNotification(rawText)) {
      return NextResponse.json(
        { ok: true, status: 'ignored', reason: '카드 결제 알림 형식이 아님' },
        { status: 200 },
      );
    }

    // 2-1) 같은 결제를 두 곳에서 알리는 경우 — 정보가 적은 쪽은 저장 없이 버린다.
    //      (온누리상품권 결제 → 온누리 알림에 가맹점이 있고, 삼성카드 알림에는 없음)
    if (isDuplicateSourceNotification(rawText)) {
      return NextResponse.json(
        { ok: true, status: 'ignored', reason: '상품권 결제는 상품권 앱 알림으로 등록됩니다' },
        { status: 200 },
      );
    }

    const normalized = normalizeNotificationText(rawText);
    const parsed = parseCardNotification(normalized);
    const dedupeKey = buildDedupeKey(parsed, normalized);

    const supabase = createServerSupabaseClient();
    const householdId = DEFAULT_HOUSEHOLD_ID;

    // 3) 알림 로그를 먼저 적재 — UNIQUE 제약이 중복 수신을 막아준다.
    const { data: logRow, error: logError } = await supabase
      .from('card_notifications')
      .insert({
        household_id: householdId,
        source: ['kakao', 'sms'].includes(source) ? source : 'unknown',
        raw_text: normalized,
        dedupe_key: dedupeKey,
        rule: parsed.rule,
        issuer: parsed.issuer,
        card_last4: parsed.card_last4,
        card_alias: parsed.card_alias,
        approved: parsed.matched ? parsed.approved : null,
        amount: parsed.amount,
        merchant: parsed.merchant,
        occurred_at: parsed.occurred_at ?? '',
        status: parsed.matched ? 'parsed' : 'unparsed',
      })
      .select('id')
      .single();

    if (logError) {
      if (logError.code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json({ ok: true, status: 'duplicate' }, { status: 200 });
      }
      throw logError;
    }

    // 4) 규칙이 없는 카드사 — 원문만 남기고 거래는 만들지 않는다.
    //    (틀린 거래가 가계부에 들어가는 것보다, 안 들어가는 편이 낫다)
    if (!parsed.matched) {
      return NextResponse.json(
        {
          ok: true,
          status: 'unparsed',
          message: '알림은 저장했지만 아직 지원하지 않는 카드사 형식입니다.',
        },
        { status: 200 },
      );
    }

    // 5) 결제자 — 지정이 없으면 가구의 첫 활성 구성원
    const { data: member } = await supabase
      .from('members')
      .select('id')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // 6) 결제수단 — 카드 끝 4자리(삼성) 또는 카드 별칭(토스뱅크)이
    //    결제수단 이름에 들어있으면 자동 연결
    const cardKey = parsed.card_last4 || parsed.card_alias;
    let paymentMethodId: string | null = null;
    if (cardKey) {
      const { data: pm } = await supabase
        .from('payment_methods')
        .select('id')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .ilike('name', `%${cardKey}%`)
        .limit(1)
        .maybeSingle();
      paymentMethodId = pm?.id ?? null;
    }

    // 7) 거래 생성
    const category = inferCategory(parsed.merchant);
    const installmentNote = parsed.installment ? ` · ${parsed.installment}` : '';
    const noteSuffix = parsed.note ? ` · ${parsed.note}` : '';

    // 금액·가맹점·날짜는 카드사가 준 값이라 사람이 다시 볼 필요가 없다.
    // 결제수단과 카테고리까지 자동으로 붙었다면 확인할 게 남지 않으므로 바로 확정한다.
    // 하나라도 비면 Inbox 로 보내 사용자가 채우게 한다.
    const autoConfirm = Boolean(paymentMethodId && category.main);

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        member_id: member?.id ?? null,
        date: parsed.date,
        type: parsed.approved ? 'variable_expense' : 'refund',
        amount: parsed.amount,
        name: parsed.merchant || parsed.note || '카드결제',
        merchant_name: parsed.merchant,
        payment_method_id: paymentMethodId,
        category_main: category.main,
        category_sub: category.sub,
        memo: `📲 카드알림 · ${parsed.issuer}${cardKey ? ` ${cardKey}` : ''}${installmentNote}${noteSuffix}`,
        tags: [],
        essential: false,
        input_type: 'text',
        raw_input: normalized,
        status: autoConfirm ? 'confirmed' : 'reviewed',
        sync_status: 'pending',
      })
      .select('id')
      .single();

    if (txError) {
      // 거래 생성 실패 시 로그 상태를 되돌려 재시도 가능하게 둔다.
      await supabase
        .from('card_notifications')
        .update({ status: 'unparsed' })
        .eq('id', logRow.id);
      throw txError;
    }

    await supabase
      .from('card_notifications')
      .update({ transaction_id: tx.id })
      .eq('id', logRow.id);

    return NextResponse.json(
      {
        ok: true,
        status: 'created',
        auto_confirmed: autoConfirm,   // true = 확인 없이 바로 가계부 반영
        transaction_id: tx.id,
        parsed: {
          issuer: parsed.issuer,
          card_last4: parsed.card_last4,
          approved: parsed.approved,
          amount: parsed.amount,
          merchant: parsed.merchant,
          date: parsed.date,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[transactions/notify]', error);
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
