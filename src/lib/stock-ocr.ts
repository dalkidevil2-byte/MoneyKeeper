/**
 * 증권사 거래내역 캡쳐 OCR — gpt-4o vision.
 * /api/stocks/transactions/ocr 와 텔레그램 webhook / 어시스턴트 chat 이 공유.
 * (HTTP 거치지 않고 서버 내부에서 직접 호출 → 미들웨어 인증 우회 문제 해결)
 */
import OpenAI from 'openai';
import { createServerSupabaseClient } from './supabase';
import { logAiUsage } from './ai-usage';
import dayjs from 'dayjs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type StockOcrTrade = {
  type?: string;
  date?: string;
  ticker?: string;
  company_name?: string;
  quantity?: number;
  price?: number;
  fee?: number;
  tax?: number;
  broker_hint?: string;
};

export type StockOcrResult = {
  trades: StockOcrTrade[];
  accounts: Array<{ id: string; broker_name: string; owner_id: string }>;
};

function extractJSON(raw: string): string {
  let s = raw.replace(/```json\n?|```/g, '').trim();
  const start = s.indexOf('{');
  if (start === -1) return s;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

/**
 * 증권사 캡쳐 → trades + 계좌 후보 반환.
 * imageUrl 은 https://… 또는 data:image/...;base64,… 둘 다 가능.
 */
export async function runStockOcr(
  imageUrl: string,
  householdId: string,
): Promise<StockOcrResult> {
  // 외부 https URL 이면 base64 로 다운로드 (Telegram CDN 등 인증 필요한 경우 대비)
  let finalUrl = imageUrl;
  if (imageUrl.startsWith('http')) {
    try {
      const r = await fetch(imageUrl);
      if (r.ok) {
        const ab = await r.arrayBuffer();
        const b64 = Buffer.from(ab).toString('base64');
        const mt = r.headers.get('content-type') ?? 'image/jpeg';
        finalUrl = `data:${mt};base64,${b64}`;
      }
    } catch {
      /* keep original */
    }
  }

  const today = dayjs().format('YYYY-MM-DD');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: finalUrl, detail: 'high' } },
          {
            type: 'text',
            text: `이 증권사 거래내역(체결확인/주문완료/거래내역/매매내역) 화면에서 거래 정보를 추출해 JSON 으로만 응답해 (마크다운 코드블록 절대 금지).

스키마:
{
  "trades": [
    {
      "type": "BUY" 또는 "SELL",
      "date": "YYYY-MM-DD (오늘은 ${today}). 화면에서 명확히 읽을 수 있을 때만. 못 읽으면 빈 문자열.",
      "ticker": "6자리 종목코드 (예: 005930) 또는 영문 티커. 한국 종목이면 코드만 적기 (서버가 .KS/.KQ 변환).",
      "company_name": "종목명 (예: 삼성전자, SNT에너지)",
      "quantity": 숫자 (체결수량/주식수),
      "price": 숫자 (체결단가/평균단가, 원 단위),
      "fee": 숫자 (수수료, 원). 없으면 0.,
      "tax": 숫자 (거래세/농특세 합산, 원). 매도 시에만, 매수면 0.,
      "broker_hint": "증권사 이름 추정 (키움/미래에셋/삼성/한투 등). 화면에서 보이면 적기, 아니면 빈 문자열."
    }
  ]
}

규칙:
- 한 화면에 여러 체결이 있으면 trades 배열에 모두 포함
- 금액은 숫자만 (쉼표/원 제외)
- 매수 표현: "매수", "구매", "구매 완료", "매수 완료", "샀어요", "buy" → BUY
- 매도 표현: "매도", "판매", "판매 완료", "매도 완료", "팔았어요", "sell" → SELL
  (토스증권은 구매/판매, 카카오뱅크증권은 사기/팔기, 키움/미래는 매수/매도)
- 체결단가가 분/초 단위로 분할되어 있으면 평균단가 사용
- 화면이 거래내역이 아니거나 글씨를 못 읽으면 trades 빈 배열
- price 와 quantity 가 명확하지 않으면 그 trade 항목 자체 생략 (확실한 것만)
- fee/tax 가 화면에 안 보이면 0 으로 (사용자가 나중에 입력)`,
          },
        ],
      },
    ],
  });

  void logAiUsage({
    model: 'gpt-4o',
    feature: 'ocr',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    householdId,
    meta: { kind: 'stocks' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  const cleaned = extractJSON(raw);
  let parsed: { trades?: StockOcrTrade[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[stock-ocr parse fail]', e, raw.slice(0, 500));
    return { trades: [], accounts: [] };
  }

  const trades = parsed.trades ?? [];

  // ticker 정규화 + 종목명 매칭
  const supabase = createServerSupabaseClient();
  const enriched: StockOcrTrade[] = [];
  for (const t of trades) {
    const out = { ...t };
    const isCode = /^\d{6}$/.test((t.ticker ?? '').trim());
    if (isCode) {
      const code = t.ticker!.trim();
      const { data: krx } = await supabase
        .from('stock_krx_stocks')
        .select('code, ticker, name')
        .eq('code', code)
        .maybeSingle();
      if (krx) {
        out.ticker = krx.ticker as string;
        if (!out.company_name) out.company_name = krx.name as string;
      }
    } else if (!t.ticker && t.company_name) {
      const { data: matches } = await supabase
        .from('stock_krx_stocks')
        .select('ticker, name')
        .ilike('name', `%${t.company_name.trim()}%`)
        .limit(1);
      if (matches && matches.length > 0) {
        out.ticker = matches[0].ticker as string;
        out.company_name = matches[0].name as string;
      }
    }
    if (!out.date) out.date = today;
    enriched.push(out);
  }

  // 계좌 후보
  const { data: owners } = await supabase
    .from('stock_owners')
    .select('id')
    .eq('household_id', householdId);
  const ownerIds = (owners ?? []).map((o) => o.id);
  let accounts: Array<{ id: string; broker_name: string; owner_id: string }> = [];
  if (ownerIds.length > 0) {
    const { data: accs } = await supabase
      .from('stock_accounts')
      .select('id, broker_name, owner_id')
      .in('owner_id', ownerIds);
    accounts = accs ?? [];
  }

  return { trades: enriched, accounts };
}
