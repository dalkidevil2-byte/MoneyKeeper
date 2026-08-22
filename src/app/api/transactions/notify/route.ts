export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { syncTransactionToNotion } from '@/lib/notion-sync';
import { syncCeremonyArchive } from '@/lib/ceremony-archive';
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

// 들어온 요청을 결과와 함께 남긴다.
// 이게 없으면 중복·무시된 요청은 흔적이 전혀 없어서
// "폰이 안 보낸 것" 과 "보냈는데 서버가 버린 것" 을 구분할 수 없다.
//
// 개인정보: 카드 알림으로 인정된 요청만 본문을 저장하고,
//          아닌 것은 길이만 남긴다 (개인 카톡이 잘못 넘어왔을 수 있으므로).
async function logRequest(opts: {
  result: string;
  reason?: string;
  source?: string;
  rawText?: string;
  storeText?: boolean;
}) {
  try {
    const supabase = createServerSupabaseClient();
    await supabase.from('notify_requests').insert({
      result: opts.result,
      reason: opts.reason ?? '',
      source: opts.source ?? 'unknown',
      raw_text: opts.storeText ? (opts.rawText ?? '').slice(0, 500) : '',
      text_length: (opts.rawText ?? '').length,
    });
  } catch (e) {
    // 기록 실패가 본 기능을 막아서는 안 된다.
    console.warn('[notify log]', e);
  }
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
    await logRequest({ result: 'unauthorized', reason: '시크릿 불일치' });
    return unauthorized('인증 실패', 401);
  }

  try {
    const { text: rawText, source } = await readText(req);

    if (!rawText.trim()) {
      await logRequest({ result: 'empty', reason: '본문이 비어서 도착', source });
      return NextResponse.json({ ok: false, error: '내용이 비어 있습니다.' }, { status: 400 });
    }

    // 2) 카드 알림이 아닌 것은 저장조차 하지 않는다.
    //    폰 설정이 잘못돼 개인 카톡이 넘어와도 DB 에 남지 않도록 하는 안전장치.
    if (!looksLikeCardNotification(rawText)) {
      await logRequest({
        result: 'ignored',
        reason: '카드 결제 알림 형식이 아님',
        source,
        rawText,
        storeText: false, // 개인 대화일 수 있으므로 내용은 남기지 않는다
      });
      return NextResponse.json(
        { ok: true, status: 'ignored', reason: '카드 결제 알림 형식이 아님' },
        { status: 200 },
      );
    }

    // 2-1) 같은 결제를 두 곳에서 알리는 경우 — 정보가 적은 쪽은 저장 없이 버린다.
    //      (온누리상품권 결제 → 온누리 알림에 가맹점이 있고, 삼성카드 알림에는 없음)
    // 2-0) 우리 가계부에 넣지 않을 카드 (예: 어머님이 쓰시는 가족 카드)
    //      같은 폰으로 알림이 와도 등록하지 않는다. 저장도 하지 않는다.
    {
      const supabaseForIgnore = createServerSupabaseClient();
      const { data: ignores } = await supabaseForIgnore
        .from('card_notification_ignores')
        .select('match_text, note')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .eq('is_active', true);

      const hit = (ignores ?? []).find((r) => rawText.includes(r.match_text as string));
      if (hit) {
        await logRequest({
          result: 'ignored',
          reason: `제외 대상 카드 (${hit.note || hit.match_text})`,
          source,
        });
        return NextResponse.json(
          { ok: true, status: 'ignored', reason: '등록하지 않기로 한 카드입니다' },
          { status: 200 },
        );
      }
    }

    if (isDuplicateSourceNotification(rawText)) {
      await logRequest({
        result: 'ignored',
        reason: '상품권 결제 — 상품권 앱 알림으로 등록',
        source,
        rawText,
        storeText: true,
      });
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
        await logRequest({ result: 'duplicate', reason: '이미 등록된 결제', source, rawText: normalized, storeText: true });
        return NextResponse.json({ ok: true, status: 'duplicate' }, { status: 200 });
      }
      throw logError;
    }

    // 3-1) 한 번의 결제가 서로 다른 곳에서 알림으로 오는 경우.
    //
    // 온누리상품권으로 결제하면 삼성카드가 알림을 두 개 보낸다.
    //   ① "[삼성카드]28,000원 승인(온누리상품권 사용) *결제대금에 미포함"  ← 문구로 걸러짐
    //   ② "삼성4530승인 ... 08/10 20:05 공간&아지트골프"               ← 평범해서 못 걸러짐
    // ②가 온누리 알림과 함께 등록돼 가계부에 같은 결제가 두 번 들어갔다.
    //
    // 판별: 같은 금액이 '다른 카드사'에서 10분 안에 오면 같은 결제로 본다.
    // 같은 카드사에서 같은 금액이 연달아 오는 것은 진짜 각각의 결제이므로 건드리지 않는다.
    // (실제로 상품권 10,950원을 1분 간격으로 두 번 결제한 기록이 있다)
    //
    // 어느 쪽을 남기나: 상품권 알림을 우선한다. 돈이 실제로 빠져나간 곳이고
    // 가맹점명도 더 정확하다('공간&아지트 골프존파크' vs '공간&아지트골프').
    if (parsed.matched && parsed.amount) {
      const windowMin = 10;
      const since = new Date(Date.now() - windowMin * 60000).toISOString();
      const { data: nearby } = await supabase
        .from('card_notifications')
        .select('id, issuer, transaction_id')
        .eq('household_id', householdId)
        .eq('amount', parsed.amount)
        .neq('issuer', parsed.issuer)
        .not('transaction_id', 'is', null)
        .gte('created_at', since);

      const conflict = (nearby ?? [])[0];
      if (conflict) {
        const incomingIsVoucher = parsed.issuer.includes('상품권');
        const existingIsVoucher = String(conflict.issuer ?? '').includes('상품권');

        if (incomingIsVoucher && !existingIsVoucher) {
          // 상품권 쪽이 나중에 왔다 — 먼저 들어온 카드 거래를 취소하고 이쪽을 남긴다.
          await supabase
            .from('transactions')
            .update({ status: 'cancelled' })
            .eq('id', conflict.transaction_id as string);
        } else {
          // 이미 등록된 쪽을 남기고 이번 알림은 버린다.
          await supabase.from('card_notifications').delete().eq('id', logRow.id);
          await logRequest({
            result: 'ignored',
            reason: `같은 결제가 ${conflict.issuer} 알림으로 이미 등록됨`,
            source,
            rawText: normalized,
            storeText: true,
          });
          return NextResponse.json(
            { ok: true, status: 'ignored', reason: '같은 결제가 다른 알림으로 이미 등록되었습니다' },
            { status: 200 },
          );
        }
      }
    }

    // 4) 규칙이 없는 카드사 — 원문만 남기고 거래는 만들지 않는다.
    //    (틀린 거래가 가계부에 들어가는 것보다, 안 들어가는 편이 낫다)
    if (!parsed.matched) {
      await logRequest({ result: 'unparsed', reason: '지원하지 않는 카드사 형식', source, rawText: normalized, storeText: true });
      return NextResponse.json(
        {
          ok: true,
          status: 'unparsed',
          message: '알림은 저장했지만 아직 지원하지 않는 카드사 형식입니다.',
        },
        { status: 200 },
      );
    }

    // 5) 알림에 적힌 이름으로 결제자 후보를 찾는다.
    //    "김*진" → 성(김)을 뺀 보이는 글자 "진" 이 이름에 들어간 구성원.
    //    딱 한 명일 때만 인정한다 (여러 명이 걸리면 확실하지 않으므로 포기).
    const { data: members } = await supabase
      .from('members')
      .select('id, name')
      .eq('household_id', householdId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    const memberList = members ?? [];
    let nameMemberId: string | null = null;
    if (parsed.payer_masked) {
      const visible = parsed.payer_masked.slice(1).replace(/\*/g, '');
      if (visible) {
        const hits = memberList.filter((m) => (m.name as string).includes(visible));
        if (hits.length === 1) nameMemberId = hits[0].id as string;
      }
    }

    // 6) 결제수단 — 카드 끝 4자리(삼성)나 별칭(토스뱅크·온누리)이 이름에 들어있는 것.
    //    한 장만 걸리면 그대로 쓴다 (사용자가 지정해둔 설정을 존중).
    //    여러 장이 걸리면(예: '주희 온누리' / '성진 온누리') 알림의 이름으로 가린다.
    const cardKey = parsed.card_last4 || parsed.card_alias;
    let paymentMethodId: string | null = null;
    let cardOwnerId: string | null = null;
    if (cardKey) {
      const { data: pms } = await supabase
        .from('payment_methods')
        .select('id, member_id')
        .eq('household_id', householdId)
        .eq('is_active', true)
        .ilike('name', `%${cardKey}%`);

      const candidates = pms ?? [];
      let picked = candidates.length === 1 ? candidates[0] : null;
      if (!picked && candidates.length > 1 && nameMemberId) {
        picked = candidates.find((c) => c.member_id === nameMemberId) ?? null;
      }
      paymentMethodId = picked?.id ?? null;
      cardOwnerId = (picked?.member_id as string | null) ?? null;
    }

    // 6-1) 카드 매칭 학습 — 이름으로 못 찾았으면, 같은 카드로 온 지난 알림에서
    //      사용자가 직접 골라 확정한 결제수단을 그대로 쓴다.
    //      (KB국민카드처럼 같은 카드사 카드를 여러 장 쓰면 이름만으로는 못 가린다.
    //       한 번 손으로 지정해주면 그다음부터 자동으로 붙는다)
    if (!paymentMethodId && parsed.card_last4) {
      const { data: past } = await supabase
        .from('card_notifications')
        .select('transaction:transactions(payment_method_id, member_id, status)')
        .eq('household_id', householdId)
        .eq('card_last4', parsed.card_last4)
        .not('transaction_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10);

      type PastRow = {
        transaction: { payment_method_id: string | null; member_id: string | null; status: string } | null;
      };
      const hit = ((past ?? []) as unknown as PastRow[]).find(
        (r) => r.transaction?.status === 'confirmed' && r.transaction?.payment_method_id,
      );
      if (hit?.transaction) {
        paymentMethodId = hit.transaction.payment_method_id;
        cardOwnerId = cardOwnerId ?? hit.transaction.member_id;
      }
    }

    // 6) 과거 학습 — 같은 가맹점을 전에 어떻게 정리했는지 본다.
    //    사용자가 Inbox 에서 카드·분류를 골라 '확정' 한 것만 신뢰한다.
    //    (자동 추측이 아니라 사람이 내린 결정을 배우기 위함)
    //    가장 최근 것 하나만 본다 — 분류를 바꾸면 그 즉시 새 값이 적용되도록.
    let learned: {
      category_main: string | null;
      category_sub: string | null;
      payment_method_id: string | null;
      member_id: string | null;
      type: string | null;
    } | null = null;

    if (parsed.merchant) {
      const { data } = await supabase
        .from('transactions')
        .select('category_main, category_sub, payment_method_id, member_id, type')
        .eq('household_id', householdId)
        .eq('merchant_name', parsed.merchant)
        .eq('status', 'confirmed')
        .neq('category_main', '')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      learned = data ?? null;
    }

    // 결제수단: 카드 이름 매칭이 우선(카드가 곧 결제수단이므로),
    //          실패하면 같은 가맹점에서 전에 쓰던 결제수단.
    if (!paymentMethodId && learned?.payment_method_id) {
      paymentMethodId = learned.payment_method_id;
    }

    // 7) 결제자 우선순위
    //    ① 연결된 카드의 주인   — 사용자가 직접 지정한 설정이라 가장 확실
    //    ② 알림에 적힌 이름     — 카드가 등록 안 돼 있어도 누가 썼는지 알 수 있음
    //    ③ 과거 같은 가맹점     — 위 둘이 없을 때의 추정
    //    ④ 첫 구성원           — 최후의 기본값
    const memberId =
      cardOwnerId ?? nameMemberId ?? learned?.member_id ?? memberList[0]?.id ?? null;

    // 8) 거래 생성
    // 카테고리: 과거에 사람이 정한 값 > 키워드 사전.
    // '주식회사농가참신' 같은 법인명은 사전으로는 절대 못 잡으므로 학습이 유일한 방법이다.
    const category = learned?.category_main
      ? { main: learned.category_main, sub: learned.category_sub ?? '' }
      : inferCategory(parsed.merchant);

    const installmentNote = parsed.installment ? ` · ${parsed.installment}` : '';
    const noteSuffix = parsed.note ? ` · ${parsed.note}` : '';

    // 금액·가맹점·날짜는 카드사가 준 값이라 사람이 다시 볼 필요가 없다.
    // 결제수단과 카테고리까지 붙었다면 확인할 게 남지 않으므로 바로 확정한다.
    // 하나라도 비면 Inbox 로 보내 사용자가 채우게 하고, 그 선택이 다음 번 학습이 된다.
    const autoConfirm = Boolean(paymentMethodId && category.main);

    // 고정비용 판별 — 매달 같은 곳에 나가는 돈은 변동 지출과 섞이면 안 된다.
    //   ① 고정지출 템플릿에 등록된 이름이면 (사용자가 직접 등록해둔 것이라 가장 확실)
    //   ② 같은 가맹점을 전에 고정비용으로 확정했으면
    // 둘 다 아니면 평소대로 변동 지출.
    let expenseType: 'variable_expense' | 'fixed_expense' = 'variable_expense';
    if (parsed.merchant) {
      const { data: templates } = await supabase
        .from('fixed_expense_templates')
        .select('name')
        .eq('household_id', householdId)
        .eq('is_active', true);

      const norm = (v: string) => v.replace(/[\s()（）㈜(주)]/g, '');
      const merchantNorm = norm(parsed.merchant);
      const matched = (templates ?? []).some((t) => {
        const n = norm(String(t.name ?? ''));
        return n.length >= 2 && (merchantNorm.includes(n) || n.includes(merchantNorm));
      });
      if (matched || learned?.type === 'fixed_expense') expenseType = 'fixed_expense';
    }

    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert({
        household_id: householdId,
        member_id: memberId,
        date: parsed.date,
        type: parsed.approved ? expenseType : 'refund',
        amount: parsed.amount,
        name: parsed.merchant || parsed.note || '카드결제',
        merchant_name: parsed.merchant,
        payment_method_id: paymentMethodId,
        category_main: category.main,
        category_sub: category.sub,
        memo: `📲 카드알림 · ${parsed.issuer}${cardKey ? ` ${cardKey}` : ''}${installmentNote}${noteSuffix}${learned?.category_main ? ' · 이전 분류 적용' : ''}${expenseType === 'fixed_expense' ? ' · 고정비용' : ''}`,
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

    // 3-1 의 재확인 — 상품권 결제는 두 알림이 같은 초에 도착하는 일이 잦다.
    // 그때는 앞선 검사에서 서로의 거래가 아직 없어 못 보고 둘 다 등록된다.
    // (실제로 19,600원 결제가 삼성·온누리 양쪽으로 등록됨)
    //
    // 거래를 만든 뒤 한 번 더 본다. 양쪽이 동시에 이 코드를 돌려도
    // '상품권 쪽을 남긴다' 는 기준이 같아서 결과가 어긋나지 않는다.
    if (parsed.matched && parsed.amount) {
      const since = new Date(Date.now() - 10 * 60000).toISOString();
      const { data: twins } = await supabase
        .from('card_notifications')
        .select('id, issuer, transaction_id')
        .eq('household_id', householdId)
        .eq('amount', parsed.amount)
        .neq('issuer', parsed.issuer)
        .not('transaction_id', 'is', null)
        .gte('created_at', since);

      const incomingIsVoucher = parsed.issuer.includes('상품권');
      for (const tw of twins ?? []) {
        const twinIsVoucher = String(tw.issuer ?? '').includes('상품권');
        if (incomingIsVoucher === twinIsVoucher) continue; // 판단 기준 없음 — 건드리지 않는다
        // 상품권이 아닌 쪽을 취소한다 (돈이 실제로 나간 곳은 상품권)
        const loserTxId = incomingIsVoucher ? (tw.transaction_id as string) : tx.id;
        await supabase.from('transactions').update({ status: 'cancelled' }).eq('id', loserTxId);
      }
    }

    // 자동 확정된 건은 Notion 동기화까지 끝내야 Inbox 에서 완전히 사라진다.
    // (Inbox 는 '동기화 안 된 거래' 를 보여주기 때문)
    // Inbox 로 보낸 건은 사용자가 분류를 고칠 수 있으므로, 확인 시점에 동기화한다.
    if (autoConfirm) {
      await syncTransactionToNotion(supabase, tx.id);
    }

    // 과거 학습으로 축의·조의까지 자동 분류된 경우 아카이브 '경조사' 에도 남긴다.
    // 바로 위 상품권 중복 처리가 거래를 취소했을 수 있어 최종 상태를 다시 읽는다.
    // (분류가 경조사가 아니면 조회 자체를 하지 않는다 — 알림 대부분은 해당 없음)
    if (category.main === '경조사·모임') {
      const { data: finalTx } = await supabase
        .from('transactions')
        .select('id, household_id, date, type, amount, name, merchant_name, memo, member_id, category_main, category_sub, status')
        .eq('id', tx.id)
        .maybeSingle();
      if (finalTx) await syncCeremonyArchive(supabase, finalTx);
    }

    await logRequest({ result: autoConfirm ? 'created(자동확정)' : 'created(Inbox)', source, rawText: normalized, storeText: true });

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
    await logRequest({ result: 'error', reason: errorMessage(error) });
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}
