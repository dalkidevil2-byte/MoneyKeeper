export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { runReceiptOcr } from '@/lib/receipt-ocr';
import { isClovaConfigured, runClovaReceiptOcr } from '@/lib/clova-ocr';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/transactions/ocr-compare
 * formData: file
 *
 * 같은 영수증 이미지를 CLOVA OCR + gpt-4o vision 둘 다 돌려서 비교용 결과 반환.
 * UI 에서 나란히 보고 어느 게 정확한지 사용자 판단.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) {
    return NextResponse.json({ error: '이미지 필요' }, { status: 400 });
  }

  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  const dataUrl = `data:${file.type || 'image/jpeg'};base64,${b64}`;

  // 병렬 실행 — CLOVA 는 텍스트만 추출, GPT 는 구조 파싱
  const [clovaResult, gptResult] = await Promise.all([
    isClovaConfigured() ? runClovaReceiptOcr(dataUrl).catch(() => null) : Promise.resolve(null),
    runGptOnly(dataUrl).catch(() => null),
  ]);

  // CLOVA raw text → GPT 로 구조 파싱
  let clovaParsed: unknown = null;
  let clovaParseError: string | null = null;
  if (clovaResult?.rawText && clovaResult.rawText.length > 30) {
    try {
      const r = await parseClovaText(clovaResult.rawText);
      const obj = r as Record<string, unknown>;
      if (obj?._error) {
        clovaParseError = obj._error as string;
        clovaParsed = null;
      } else {
        clovaParsed = r;
      }
    } catch (e) {
      clovaParseError = e instanceof Error ? e.message : String(e);
    }
  } else if (clovaResult && (!clovaResult.rawText || clovaResult.rawText.length <= 30)) {
    clovaParseError = `CLOVA raw text 너무 짧음 (${clovaResult.rawText?.length ?? 0}자)`;
  } else if (!clovaResult) {
    clovaParseError = 'CLOVA 응답 없음 (env / 인증 / API 호출 실패)';
  }

  return NextResponse.json({
    clova_configured: isClovaConfigured(),
    clova_raw_text: clovaResult?.rawText ?? null,
    clova: clovaParsed,
    clova_parse_error: clovaParseError,
    gpt: gptResult,
  });
}

async function parseClovaText(rawText: string) {
  let raw = '';
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `한국 영수증 OCR raw 텍스트에서 **총합계 + 세부 항목만** 정확히 추출.

[OCR 텍스트]
${rawText}

[목표 — 딱 두 개만]
1. **total** = **실제 결제 금액** (할인 적용 후 사용자가 낸 돈)
   - 우선순위: "결제금액" > "카드결제" > "신용카드" 옆 숫자
   - "총합계" 는 할인 전이라 X
   - 예: "총합계 23,710원" / "결제금액 14,850원" → total = **14850**
2. **items** — 각 줄의 (상품명, 금액) 쌍

[items.amount 식별]
한국 마트 영수증은 표 형식 (상품명 / 단가 / 수량 / 금액).
- "금액" 컬럼 숫자 = amount (단가/수량 X)
- OCR 가 컬럼별로 묶어 출력하면 같은 인덱스끼리 매칭
- 증정품(₩0, 증정 표시) 은 amount=0 또는 생략

[검증 (느슨하게)]
- items 합이 total (할인 후) 보다 클 수 있음 — 할인 차이 정상
- 단, items 합이 total 보다 너무 작거나 (예: total=14,850 인데 items 합=11) → 수량을 amount 로 잘못 본 것. 재매칭.

[skip — 추출 X]
가게명/날짜/결제수단/사업자번호/포인트 → 사용자가 직접 입력. 빈 문자열로 둘 것.

응답:
{
  "store_name": "",
  "date": "",
  "items": [{"name":"카스캔500ML", "amount":4600}],
  "total": 23710
}`,
        },
      ],
    });
    raw = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[parseClovaText]', (e as Error).message, raw.slice(0, 200));
    return { _error: (e as Error).message, _raw: raw.slice(0, 500) };
  }
}

/**
 * gpt-4o vision 만으로 영수증 파싱 (raw 형식).
 * receipt-ocr.ts 의 로직 단순화 버전 — 카테고리 분류 X, 텍스트만 비교용.
 */
async function runGptOnly(dataUrl: string): Promise<{
  store_name?: string;
  date?: string;
  total?: number;
  items: Array<{ name: string; amount: number }>;
} | null> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            {
              type: 'text',
              text: `이 영수증에서 가게명, 날짜, 품목들, 합계를 JSON 으로:
{
  "store_name": "...",
  "date": "YYYY-MM-DD",
  "items": [{"name": "상품명", "amount": 숫자}],
  "total": 숫자
}`,
            },
          ],
        },
      ],
    });
    const raw = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[gpt-only OCR]', e);
    return null;
  }
}
