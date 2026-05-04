export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import {
  sendTelegramMessage,
  answerCallbackQuery,
  editTelegramMessage,
} from '@/lib/telegram';
import { runAssistant, type ChatHistoryItem } from '@/lib/assistant-chat';
import dayjs from 'dayjs';
import OpenAI from 'openai';
import { logAiUsage } from '@/lib/ai-usage';
import { classifyImage } from '@/lib/image-classifier';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HISTORY_TURNS = 10; // 최근 10턴 (= user + assistant 페어 5쌍)

/**
 * 텔레그램 봇 webhook.
 * 텔레그램 → POST /api/telegram/webhook?secret=CRON_SECRET
 * body: Telegram Update 객체
 *
 * 메시지 처리 흐름:
 * 1) chat_id 추출 → households / members 매칭으로 household 식별
 * 2) telegram_chat_history 에서 최근 history 로드
 * 3) runAssistant() 호출
 * 4) sendTelegramMessage 로 답변 전송
 * 5) history 저장
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // inline keyboard 버튼 클릭 → callback_query 처리
    if (body?.callback_query) {
      return await handleCallbackQuery(body.callback_query);
    }

    const message = body?.message ?? body?.edited_message;
    if (!message?.chat?.id) {
      return NextResponse.json({ ok: true, ignored: 'no chat' });
    }
    const chatId = String(message.chat.id);

    // 사진 → 분류 후 적절한 핸들러로 라우팅 (영수증 / 증권사 캡쳐 / 추천 메시지)
    if (message.photo && Array.isArray(message.photo) && message.photo.length > 0) {
      return await handlePhoto(chatId, message);
    }

    // 음성 메시지 → STT 후 텍스트 흐름으로 위임
    let userText: string = message.text ?? '';
    if (!userText && (message.voice || message.audio)) {
      const transcribed = await handleVoiceMessage(chatId, message);
      if (transcribed) {
        userText = transcribed;
      } else {
        return NextResponse.json({ ok: true, ignored: 'voice transcribe fail' });
      }
    }

    if (!userText) {
      return NextResponse.json({ ok: true, ignored: 'no text' });
    }

    // /start 명령어
    if (userText.startsWith('/start')) {
      const { data: tg } = await createServerSupabaseClient()
        .from('telegram_settings')
        .select('bot_token')
        .eq('household_id', DEFAULT_HOUSEHOLD_ID)
        .maybeSingle();
      if (tg?.bot_token) {
        await sendTelegramMessage(
          tg.bot_token,
          chatId,
          `안녕하세요! 일정·할일·시간 어시스턴트예요. 🤖\n\n예시:\n• 오늘 일정 알려줘\n• 내일 9시에 회의 추가해줘\n• 이번 주 어디에 시간 많이 썼어?\n\n자연스럽게 물어보세요.`,
        );
      }
      return NextResponse.json({ ok: true, action: 'start' });
    }

    const supabase = createServerSupabaseClient();

    // chat_id 로 household + member 식별
    const { data: member } = await supabase
      .from('members')
      .select('household_id, name')
      .eq('telegram_chat_id', chatId)
      .eq('is_active', true)
      .maybeSingle();

    const householdId = (member?.household_id as string) ?? DEFAULT_HOUSEHOLD_ID;

    // 토큰 + 활성 여부
    const { data: tg } = await supabase
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!tg?.bot_token || tg.enabled === false) {
      return NextResponse.json({ ok: true, ignored: 'tg disabled' });
    }

    // 등록 안 된 chat_id 면 안내
    if (!member) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        `등록되지 않은 사용자에요.\n앱 → 할일 → 설정 → 텔레그램 설정 에서 chat_id (${chatId}) 를 멤버에 등록해주세요.`,
      );
      return NextResponse.json({ ok: true, ignored: 'unknown chat_id' });
    }

    // 최근 history 로드
    const { data: histRows } = await supabase
      .from('telegram_chat_history')
      .select('role, content')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS);
    const history: ChatHistoryItem[] = ((histRows ?? []) as ChatHistoryItem[])
      .reverse(); // 오래된 것 먼저

    // AI 호출
    let reply: string;
    try {
      const { content } = await runAssistant(householdId, userText, history);
      reply = content || '답변을 생성하지 못했어요.';
    } catch (e) {
      console.error('[tg webhook] runAssistant', e);
      reply = '죄송해요, 처리 중 문제가 발생했어요.';
    }

    // 텔레그램 전송
    await sendTelegramMessage(tg.bot_token, chatId, reply);

    // history 저장 (user + assistant)
    await supabase.from('telegram_chat_history').insert([
      { household_id: householdId, chat_id: chatId, role: 'user', content: userText },
      { household_id: householdId, chat_id: chatId, role: 'assistant', content: reply },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[tg webhook]', e);
    // 텔레그램은 200 외 응답이면 재전송하므로 항상 200 으로
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

// ─────────────────────────────────────────
// 음성 메시지 처리 — Whisper STT
// 변환 결과 텍스트만 반환. 그 후 호출 측에서 일반 텍스트 흐름 진행.
// ─────────────────────────────────────────
async function handleVoiceMessage(
  chatId: string,
  message: {
    voice?: { file_id: string; duration?: number; mime_type?: string };
    audio?: { file_id: string; duration?: number; mime_type?: string };
  },
): Promise<string | null> {
  const supabase = createServerSupabaseClient();
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle();
  if (!tg?.bot_token) return null;

  const fileObj = message.voice ?? message.audio;
  if (!fileObj?.file_id) return null;

  try {
    // 1) Telegram getFile
    const fileRes = await fetch(
      `https://api.telegram.org/bot${tg.bot_token}/getFile?file_id=${fileObj.file_id}`,
    );
    const fileJson = await fileRes.json();
    const filePath = fileJson?.result?.file_path;
    if (!filePath) return null;

    const audioRes = await fetch(
      `https://api.telegram.org/file/bot${tg.bot_token}/${filePath}`,
    );
    if (!audioRes.ok) return null;
    const arrayBuf = await audioRes.arrayBuffer();
    // Telegram voice = OGG/Opus, audio = MP3 등. 파일 확장자 추출
    const ext = filePath.split('.').pop() ?? 'ogg';
    const mimeType =
      fileObj.mime_type ?? (ext === 'ogg' ? 'audio/ogg' : `audio/${ext}`);

    // 2) Whisper API
    const blob = new Blob([arrayBuf], { type: mimeType });
    const file = new File([blob], `voice.${ext}`, { type: mimeType });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ko',
    });
    const text = transcription.text?.trim() ?? '';
    // Whisper 가격은 분당 — 한국어는 대략 5자/초로 추정
    const estSeconds = Math.max(1, Math.round(text.length / 5));
    void logAiUsage({
      model: 'whisper-1',
      feature: 'stt',
      audioSeconds: estSeconds,
      meta: { source: 'telegram', estimated: true },
    });
    if (!text) return null;

    // 3) 사용자에게 인식 결과 즉시 알려주기
    await sendTelegramMessage(tg.bot_token, chatId, `🎙 "${text}"`);
    return text;
  } catch (e) {
    console.error('[voice STT]', e);
    await sendTelegramMessage(
      tg.bot_token,
      chatId,
      `⚠️ 음성 인식 실패: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

// ─────────────────────────────────────────
// 영수증 사진 처리
// ─────────────────────────────────────────
/**
 * inline keyboard 버튼 클릭 처리 — confirm/cancel pending action.
 */
async function handleCallbackQuery(cb: {
  id: string;
  data?: string;
  from?: { id: number };
  message?: { chat: { id: number }; message_id: number };
}) {
  const supabase = createServerSupabaseClient();
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token, household_id')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle();
  const token = tg?.bot_token;
  const chatId = cb.message?.chat.id ? String(cb.message.chat.id) : '';
  const messageId = cb.message?.message_id;

  if (!token || !chatId) {
    return NextResponse.json({ ok: false, ignored: 'no token/chat' });
  }

  const data = cb.data ?? '';
  const [action, pendingId] = data.split(':');

  if (!pendingId) {
    await answerCallbackQuery(token, cb.id, '잘못된 요청');
    return NextResponse.json({ ok: false });
  }

  const { data: pending } = await supabase
    .from('telegram_pending_actions')
    .select('*')
    .eq('id', pendingId)
    .maybeSingle();

  if (!pending) {
    await answerCallbackQuery(token, cb.id, '만료된 요청이에요.');
    return NextResponse.json({ ok: false });
  }
  if (pending.status !== 'pending') {
    await answerCallbackQuery(token, cb.id, `이미 처리됨 (${pending.status}).`);
    return NextResponse.json({ ok: false });
  }
  const expired = new Date(pending.expires_at as string).getTime() < Date.now();
  if (expired) {
    await supabase
      .from('telegram_pending_actions')
      .update({ status: 'expired' })
      .eq('id', pendingId);
    await answerCallbackQuery(token, cb.id, '시간이 지나 만료됨.');
    return NextResponse.json({ ok: false });
  }

  // 취소
  if (action === 'cancel') {
    await supabase
      .from('telegram_pending_actions')
      .update({ status: 'cancelled' })
      .eq('id', pendingId);
    await answerCallbackQuery(token, cb.id, '취소됨');
    if (messageId) {
      await editTelegramMessage(token, chatId, messageId, '❌ 취소했어요.');
    }
    return NextResponse.json({ ok: true });
  }

  // 확정
  if (action === 'confirm') {
    if (pending.kind === 'stock_trades_import') {
      const payload = pending.payload as {
        trades: Array<{
          account_id?: string;
          ticker: string;
          company_name?: string;
          type: 'BUY' | 'SELL';
          date: string;
          quantity: number;
          price: number;
          fee: number;
          tax: number;
        }>;
      };
      let inserted = 0;
      const failed: string[] = [];
      for (const t of payload.trades) {
        if (!t.account_id) {
          failed.push(`${t.company_name || t.ticker}: 계좌 미지정`);
          continue;
        }
        const { error } = await supabase.from('stock_transactions').insert({
          account_id: t.account_id,
          ticker: t.ticker,
          company_name: t.company_name ?? '',
          type: t.type,
          date: t.date,
          quantity: t.quantity,
          price: t.price,
          fee: t.fee,
          tax: t.tax,
          memo: '📲 텔레그램 OCR',
        });
        if (error) failed.push(`${t.company_name || t.ticker}: ${error.message}`);
        else inserted++;
      }
      await supabase
        .from('telegram_pending_actions')
        .update({ status: 'confirmed' })
        .eq('id', pendingId);
      await answerCallbackQuery(token, cb.id, `${inserted}건 등록`);
      if (messageId) {
        let resultText = `✅ ${inserted}건 등록 완료`;
        if (failed.length) {
          resultText += `\n\n⚠️ 실패 ${failed.length}건:\n${failed.join('\n')}`;
        }
        if (inserted > 0) {
          resultText += '\n\n🔍 앱 → 주식 → 거래내역 에서 확인.';
        }
        await editTelegramMessage(token, chatId, messageId, resultText);
      }
      return NextResponse.json({ ok: true, inserted });
    }
    // 다른 kind 추가 가능
    await answerCallbackQuery(token, cb.id, '지원하지 않는 종류');
    return NextResponse.json({ ok: false });
  }

  await answerCallbackQuery(token, cb.id, '알 수 없는 액션');
  return NextResponse.json({ ok: false });
}

/**
 * 사진 dispatcher — gpt-4o-mini 로 분류 후 적절한 핸들러 호출.
 * - receipt → 가계부 영수증 처리
 * - stock_brokerage → 증권사 캡쳐 → stock_transactions 자동 등록
 * - stock_recommendation → AI 어시스턴트로 위임 (텍스트 추출 후 save_stock_recommendation)
 * - other → 영수증으로 시도 (fallback)
 */
async function handlePhoto(
  chatId: string,
  message: {
    photo: Array<{ file_id: string; width: number; height: number }>;
    caption?: string;
  },
) {
  const supabase = createServerSupabaseClient();
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle();

  // 텔레그램에서 image url 받기
  const photo = message.photo[message.photo.length - 1];
  let imageUrl = '';
  if (tg?.bot_token) {
    try {
      const fileRes = await fetch(
        `https://api.telegram.org/bot${tg.bot_token}/getFile?file_id=${photo.file_id}`,
      );
      const fileJson = await fileRes.json();
      const filePath = fileJson?.result?.file_path;
      if (filePath) {
        imageUrl = `https://api.telegram.org/file/bot${tg.bot_token}/${filePath}`;
      }
    } catch (e) {
      console.warn('[handlePhoto] getFile fail', e);
    }
  }

  // 분류 — 실패 시 receipt 로 fallback
  let kind: 'receipt' | 'stock_brokerage' | 'stock_recommendation' | 'other' = 'receipt';
  if (imageUrl) {
    try {
      const cls = await classifyImage(imageUrl, message.caption);
      kind = cls.kind;
      console.log('[image-classify]', { kind, conf: cls.confidence, reason: cls.reason });
    } catch (e) {
      console.warn('[classify fail] fallback to receipt', e);
    }
  }

  if (kind === 'stock_brokerage') {
    return await handleStockBrokeragePhoto(chatId, imageUrl);
  }
  // stock_recommendation 은 일단 receipt 로 떨어뜨리지 않고 명시 안내
  if (kind === 'stock_recommendation') {
    if (tg?.bot_token) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        '📨 추천 메시지로 보여요. 텍스트로 직접 보내주시면 종목 메모로 저장해 드릴게요.',
      );
    }
    return NextResponse.json({ ok: true, kind });
  }
  // receipt / other → 영수증 처리
  return await handleReceiptPhoto(chatId, message);
}

/**
 * 증권사 거래내역 캡쳐 → stock_transactions 자동 등록.
 */
async function handleStockBrokeragePhoto(chatId: string, imageUrl: string) {
  const supabase = createServerSupabaseClient();

  const { data: member } = await supabase
    .from('members')
    .select('household_id, id, name')
    .eq('telegram_chat_id', chatId)
    .eq('is_active', true)
    .maybeSingle();
  const householdId = (member?.household_id as string) ?? DEFAULT_HOUSEHOLD_ID;

  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token, enabled')
    .eq('household_id', householdId)
    .maybeSingle();
  if (!tg?.bot_token || tg.enabled === false) {
    return NextResponse.json({ ok: true, ignored: 'tg disabled' });
  }
  if (!member) {
    await sendTelegramMessage(
      tg.bot_token,
      chatId,
      `등록되지 않은 사용자에요. chat_id: ${chatId}`,
    );
    return NextResponse.json({ ok: true, ignored: 'unknown chat_id' });
  }
  if (!imageUrl) {
    await sendTelegramMessage(tg.bot_token, chatId, '⚠️ 이미지 못 받았어요.');
    return NextResponse.json({ ok: false });
  }

  await sendTelegramMessage(tg.bot_token, chatId, '📈 증권사 거래내역 분석 중…');

  try {
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ??
      'https://money-keeper-zgo7.vercel.app';
    const ocrRes = await fetch(`${origin}/api/stocks/transactions/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, household_id: householdId }),
    });
    if (!ocrRes.ok) {
      throw new Error(`stock OCR ${ocrRes.status}`);
    }
    const { trades = [], accounts = [] } = (await ocrRes.json()) as {
      trades: Array<{
        type?: string;
        date?: string;
        ticker?: string;
        company_name?: string;
        quantity?: number;
        price?: number;
        fee?: number;
        tax?: number;
        broker_hint?: string;
      }>;
      accounts: Array<{ id: string; broker_name: string; owner_id: string }>;
    };

    if (trades.length === 0) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        '⚠️ 거래내역을 못 읽었어요. 더 선명한 사진으로 보내주세요.',
      );
      return NextResponse.json({ ok: true, trades: 0 });
    }

    if (accounts.length === 0) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        '⚠️ 등록된 주식 계좌가 없어요. 앱에서 계좌 먼저 만들어 주세요.',
      );
      return NextResponse.json({ ok: false, error: 'no_account' });
    }

    // 계좌 자동 매칭 — broker_hint 우선, 없으면 첫 계좌
    const pickAccount = (brokerHint?: string) => {
      if (brokerHint) {
        const hit = accounts.find((a) =>
          (a.broker_name ?? '').includes(brokerHint),
        );
        if (hit) return hit;
      }
      return accounts[0];
    };

    // 유효한 trades 만 추려서 계좌까지 미리 매칭
    const prepared = trades
      .filter((t) => t.ticker && t.quantity && t.price != null)
      .map((t) => {
        const acc = pickAccount(t.broker_hint);
        return {
          account_id: acc?.id,
          broker_name: acc?.broker_name ?? '',
          ticker: t.ticker!,
          company_name: t.company_name ?? '',
          type: t.type === 'SELL' ? 'SELL' : 'BUY',
          date: t.date || dayjs().format('YYYY-MM-DD'),
          quantity: t.quantity!,
          price: t.price!,
          fee: typeof t.fee === 'number' && t.fee >= 0 ? t.fee : 0,
          tax: typeof t.tax === 'number' && t.tax >= 0 ? t.tax : 0,
        };
      });

    if (prepared.length === 0) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        '⚠️ 분석은 됐지만 등록 가능한 거래가 없어요 (수량/단가 누락).',
      );
      return NextResponse.json({ ok: true, trades: 0 });
    }

    // pending 으로 저장 → 버튼으로 사용자 확정 받기
    const summary = prepared.map((t) => {
      const sign = t.type === 'SELL' ? '➖' : '➕';
      return `${sign} ${t.company_name || t.ticker} ${t.quantity}주 @ ${Number(t.price).toLocaleString()}원${t.broker_name ? ` (${t.broker_name})` : ''}`;
    });

    const { data: pending, error: pendErr } = await supabase
      .from('telegram_pending_actions')
      .insert({
        chat_id: chatId,
        household_id: householdId,
        member_id: member.id,
        kind: 'stock_trades_import',
        payload: { trades: prepared },
      })
      .select('id')
      .single();
    if (pendErr || !pending) {
      throw new Error(`pending 저장 실패: ${pendErr?.message}`);
    }

    const text =
      `📈 <b>주식 거래내역 분석</b> (${prepared.length}건)\n\n${summary.join('\n')}\n\n등록할까요?`;
    await sendTelegramMessage(tg.bot_token, chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ 등록', callback_data: `confirm:${pending.id}` },
            { text: '❌ 취소', callback_data: `cancel:${pending.id}` },
          ],
        ],
      },
    });

    return NextResponse.json({ ok: true, pending: pending.id, total: prepared.length });
  } catch (e) {
    console.error('[stock-brokerage-photo]', e);
    await sendTelegramMessage(
      tg.bot_token,
      chatId,
      `⚠️ 주식 거래내역 처리 오류: ${e instanceof Error ? e.message : ''}`,
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function handleReceiptPhoto(
  chatId: string,
  message: {
    photo: Array<{ file_id: string; width: number; height: number }>;
    caption?: string;
  },
) {
  const supabase = createServerSupabaseClient();

  // 멤버 식별
  const { data: member } = await supabase
    .from('members')
    .select('household_id, id, name')
    .eq('telegram_chat_id', chatId)
    .eq('is_active', true)
    .maybeSingle();
  const householdId = (member?.household_id as string) ?? DEFAULT_HOUSEHOLD_ID;

  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token, enabled')
    .eq('household_id', householdId)
    .maybeSingle();
  if (!tg?.bot_token || tg.enabled === false) {
    return NextResponse.json({ ok: true, ignored: 'tg disabled' });
  }
  if (!member) {
    await sendTelegramMessage(
      tg.bot_token,
      chatId,
      `등록되지 않은 사용자에요. 설정에서 chat_id (${chatId})를 멤버에 등록해주세요.`,
    );
    return NextResponse.json({ ok: true, ignored: 'unknown chat_id' });
  }

  // 가장 큰 사이즈 사진
  const photo = message.photo[message.photo.length - 1];
  await sendTelegramMessage(
    tg.bot_token,
    chatId,
    '📸 영수증 분석 중… 잠시만요',
  );

  try {
    // 1) Telegram getFile
    const fileRes = await fetch(
      `https://api.telegram.org/bot${tg.bot_token}/getFile?file_id=${photo.file_id}`,
    );
    const fileJson = await fileRes.json();
    const filePath = fileJson?.result?.file_path;
    if (!filePath) throw new Error('파일 경로 못 받음');
    const imageUrl = `https://api.telegram.org/file/bot${tg.bot_token}/${filePath}`;

    // 2) OCR 호출 — 같은 origin 의 OCR endpoint 재사용
    const origin = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://m-keeper-zgo7-git-main-dalkidevil2-6147s-projects.vercel.app';
    const ocrRes = await fetch(`${origin}/api/transactions/ocr?secret=${process.env.CRON_SECRET ?? ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        household_id: householdId,
      }),
    });

    if (!ocrRes.ok) {
      const txt = await ocrRes.text();
      throw new Error(`OCR ${ocrRes.status}: ${txt.slice(0, 100)}`);
    }
    const ocrJson = await ocrRes.json();
    const items = (ocrJson.items ?? []) as Array<{
      name: string;
      amount: number;
      category_main?: string;
      category_sub?: string;
    }>;
    const storeName = ocrJson.store_name ?? '';
    const date = ocrJson.date || dayjs().format('YYYY-MM-DD');
    const total = ocrJson.total ?? items.reduce((s, i) => s + (i.amount ?? 0), 0);

    if (items.length === 0) {
      await sendTelegramMessage(
        tg.bot_token,
        chatId,
        '⚠️ 영수증을 못 읽었어요. 더 선명한 사진으로 다시 보내주세요.',
      );
      return NextResponse.json({ ok: true, items: 0 });
    }

    // 3) draft 거래로 저장
    let inserted = 0;
    for (const it of items) {
      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        member_id: member.id,
        amount: Math.abs(it.amount),
        type: it.amount < 0 ? 'income' : 'variable_expense',
        category_main: it.category_main ?? '',
        category_sub: it.category_sub ?? '',
        merchant_name: storeName,
        name: it.name ?? storeName,
        memo: `📲 텔레그램 (${it.name})`,
        date,
        input_type: 'ocr',
        raw_input: '',
        tags: [],
        essential: false,
        status: 'reviewed',
        sync_status: 'pending',
      });
      if (error) console.warn('[receipt insert]', error);
      else inserted++;
    }

    // 4) 답변
    const reply = `✅ 영수증 분석 완료
🏪 ${storeName || '미확인'}
📅 ${date}
🧾 ${items.length}건 · 총 ${total.toLocaleString('ko-KR')}원

📥 ${inserted}건 Inbox 에 저장
앱 → 가계부 → 우상단 📥 Inbox 에서 확인 후 확정해주세요.`;
    await sendTelegramMessage(tg.bot_token, chatId, reply);

    return NextResponse.json({ ok: true, inserted });
  } catch (e) {
    console.error('[receipt-photo]', e);
    await sendTelegramMessage(
      tg.bot_token,
      chatId,
      `⚠️ 영수증 처리 중 오류: ${e instanceof Error ? e.message : '알 수 없음'}`,
    );
    return NextResponse.json({ ok: false, error: String(e) });
  }
}

// GET: webhook 등록 helper — /api/telegram/webhook?secret=...&action=set/delete
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  if (!action) {
    return NextResponse.json({
      hint: 'GET /api/telegram/webhook?action=set | info | delete',
    });
  }

  const supabase = createServerSupabaseClient();
  const { data: tg } = await supabase
    .from('telegram_settings')
    .select('bot_token')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .maybeSingle();
  if (!tg?.bot_token) {
    return NextResponse.json({ error: 'no bot_token' }, { status: 400 });
  }

  const tgUrl = (path: string) =>
    `https://api.telegram.org/bot${tg.bot_token}/${path}`;

  if (action === 'set') {
    const callback = `${new URL(req.url).origin}/api/telegram/webhook?secret=${process.env.CRON_SECRET ?? ''}`;
    const r = await fetch(tgUrl('setWebhook'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: callback,
        allowed_updates: ['message', 'edited_message'],
      }),
    });
    return NextResponse.json({ action: 'set', telegram: await r.json(), callback });
  }
  if (action === 'info') {
    const r = await fetch(tgUrl('getWebhookInfo'));
    return NextResponse.json(await r.json());
  }
  if (action === 'delete') {
    const r = await fetch(tgUrl('deleteWebhook'), { method: 'POST' });
    return NextResponse.json(await r.json());
  }
  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
