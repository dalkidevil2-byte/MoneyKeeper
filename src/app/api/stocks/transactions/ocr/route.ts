export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

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
 * POST /api/stocks/transactions/ocr
 * 증권사 거래내역 캡쳐를 OCR(gpt-4o vision) 로 파싱.
 * **DB 저장 안 함** — 파싱 결과만 반환. 사용자가 검토 후 정식 등록.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let imageUrl: string;
    let householdId = DEFAULT_HOUSEHOLD_ID;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      if (!body.imageUrl) {
        return NextResponse.json({ error: 'imageUrl 필요' }, { status: 400 });
      }
      try {
        const r = await fetch(body.imageUrl);
        if (r.ok) {
          const ab = await r.arrayBuffer();
          const b64 = Buffer.from(ab).toString('base64');
          const mt = r.headers.get('content-type') ?? 'image/jpeg';
          imageUrl = `data:${mt};base64,${b64}`;
        } else {
          imageUrl = body.imageUrl;
        }
      } catch {
        imageUrl = body.imageUrl;
      }
      if (body.household_id) householdId = body.household_id;
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const base64 = formData.get('base64') as string | null;
      const mimeType = (formData.get('mimeType') as string) || 'image/jpeg';
      householdId = (formData.get('household_id') as string) || DEFAULT_HOUSEHOLD_ID;

      if (base64) {
        imageUrl = `data:${mimeType};base64,${base64}`;
      } else if (file) {
        const buf = await file.arrayBuffer();
        const b64 = Buffer.from(buf).toString('base64');
        imageUrl = `data:${file.type};base64,${b64}`;
      } else {
        return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
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
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
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
- "매수" → BUY, "매도"/"매도매도" → SELL
- 체결단가가 분/초 단위로 분할되어 있으면 평균단가 사용
- 화면이 거래내역이 아니거나 글씨를 못 읽으면 trades 빈 배열
- price 와 quantity 가 명확하지 않으면 그 trade 항목 자체 생략 (확실한 것만)
- fee/tax 가 화면에 안 보이면 0 으로 (사용자가 나중에 입력)`,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = extractJSON(raw);
    let parsed: { trades?: Array<{
      type?: string; date?: string; ticker?: string; company_name?: string;
      quantity?: number; price?: number; fee?: number; tax?: number; broker_hint?: string;
    }> };
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[stock-ocr parse fail]', e, raw.slice(0, 500));
      return NextResponse.json(
        { error: 'OCR 응답 해석 실패. 다시 시도해주세요.', raw: raw.slice(0, 500) },
        { status: 502 },
      );
    }

    const trades = parsed.trades ?? [];

    // ticker 정규화: 6자리 숫자만 있으면 KRX 매칭으로 .KS/.KQ 붙이기
    const supabase = createServerSupabaseClient();
    const enriched: typeof trades = [];
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
        // 종목명만 있을 때 KRX 매칭
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
      // 날짜 기본값
      if (!out.date) out.date = today;
      enriched.push(out);
    }

    // 가능한 계좌 후보 (사용자가 시트에서 선택)
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

    return NextResponse.json({ trades: enriched, accounts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OCR 오류';
    console.error('[stock-ocr]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
