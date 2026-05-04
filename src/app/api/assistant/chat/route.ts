export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { runAssistant, type ChatHistoryItem } from '@/lib/assistant-chat';
import { classifyImage } from '@/lib/image-classifier';
import { createServerSupabaseClient } from '@/lib/supabase';
import { runStockOcr } from '@/lib/stock-ocr';
import dayjs from 'dayjs';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';

    let userMessage = '';
    let history: ChatHistoryItem[] = [];
    let imageUrl: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      // 이미지 첨부 모드
      const fd = await req.formData();
      userMessage = (fd.get('message') as string) ?? '';
      const historyStr = fd.get('history') as string | null;
      if (historyStr) {
        try {
          history = JSON.parse(historyStr);
        } catch {
          /* ignore */
        }
      }
      const file = fd.get('file') as File | null;
      if (file) {
        const buf = await file.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        imageUrl = `data:${file.type || 'image/jpeg'};base64,${b64}`;
      }
    } else {
      const body = await req.json();
      userMessage = body.message ?? '';
      history = body.history ?? [];
    }

    if (!userMessage && !imageUrl) {
      return NextResponse.json({ error: 'message 또는 이미지 필요' }, { status: 400 });
    }

    // ─── 이미지 분류 후 증권사 캡쳐면 short-circuit 처리 ───
    if (imageUrl) {
      try {
        const cls = await classifyImage(imageUrl, userMessage || undefined);
        if (cls.kind === 'stock_brokerage' && cls.confidence >= 0.4) {
          const pending = await prepareStockTradesPending(imageUrl);
          if (pending) {
            return NextResponse.json({
              ok: true,
              content: pending.message,
              pending: {
                id: pending.id,
                kind: 'stock_trades_import',
                trades: pending.trades,
              },
            });
          }
          // OCR 실패 시 일반 어시스턴트 흐름으로 fallback
        }
      } catch (e) {
        console.warn('[assistant/chat classify]', e);
      }
    }

    const { content, tool_calls } = await runAssistant(
      HOUSEHOLD_ID,
      userMessage || '이 이미지를 분석해줘',
      history,
      imageUrl,
    );
    return NextResponse.json({ ok: true, content, tool_calls });
  } catch (e) {
    console.error('[assistant/chat]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

/**
 * 증권사 캡쳐 → stock OCR → pending 저장.
 * 텔레그램과 동일하게 telegram_pending_actions 테이블 재사용 (chat_id='assistant:<household>').
 */
async function prepareStockTradesPending(imageUrl: string): Promise<{
  id: string;
  message: string;
  trades: Array<Record<string, unknown>>;
} | null> {
  const supabase = createServerSupabaseClient();

  let trades: Array<{
    type?: string;
    date?: string;
    ticker?: string;
    company_name?: string;
    quantity?: number;
    price?: number;
    fee?: number;
    tax?: number;
    broker_hint?: string;
  }> = [];
  let accounts: Array<{ id: string; broker_name: string; owner_id: string }> = [];
  try {
    const r = await runStockOcr(imageUrl, HOUSEHOLD_ID);
    trades = r.trades;
    accounts = r.accounts;
  } catch (e) {
    console.warn('[stock OCR]', e);
    return null;
  }
  if (trades.length === 0) return null;
  if (accounts.length === 0) {
    return {
      id: '',
      message: '⚠️ 등록된 주식 계좌가 없어요. 앱에서 계좌 먼저 만들어 주세요.',
      trades: [],
    };
  }

  const pickAccount = (brokerHint?: string) => {
    if (brokerHint) {
      const hit = accounts.find((a) => (a.broker_name ?? '').includes(brokerHint));
      if (hit) return hit;
    }
    return accounts[0];
  };

  const prepared = trades
    .filter((t) => t.ticker && t.quantity && t.price != null)
    .map((t) => {
      const acc = pickAccount(t.broker_hint);
      return {
        account_id: acc?.id,
        broker_name: acc?.broker_name ?? '',
        ticker: t.ticker!,
        company_name: t.company_name ?? '',
        type: (t.type === 'SELL' ? 'SELL' : 'BUY') as 'BUY' | 'SELL',
        date: t.date || dayjs().format('YYYY-MM-DD'),
        quantity: t.quantity!,
        price: t.price!,
        fee: typeof t.fee === 'number' && t.fee >= 0 ? t.fee : 0,
        tax: typeof t.tax === 'number' && t.tax >= 0 ? t.tax : 0,
      };
    });

  if (prepared.length === 0) return null;

  const { data: pending, error } = await supabase
    .from('telegram_pending_actions')
    .insert({
      chat_id: `assistant:${HOUSEHOLD_ID}`,
      household_id: HOUSEHOLD_ID,
      kind: 'stock_trades_import',
      payload: { trades: prepared },
    })
    .select('id')
    .single();

  if (error || !pending) {
    console.warn('[pending insert]', error);
    return null;
  }

  return {
    id: pending.id,
    message: `📈 주식 거래 ${prepared.length}건이 분석됐어요. 확인 후 등록해주세요.`,
    trades: prepared,
  };
}
