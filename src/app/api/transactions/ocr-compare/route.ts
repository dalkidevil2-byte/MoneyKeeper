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
  let clovaParsed: Awaited<ReturnType<typeof runGptOnly>> | null = null;
  if (clovaResult?.rawText && clovaResult.rawText.length > 30) {
    clovaParsed = await parseClovaText(clovaResult.rawText).catch(() => null);
  }

  return NextResponse.json({
    clova_configured: isClovaConfigured(),
    clova_raw_text: clovaResult?.rawText ?? null,
    clova: clovaParsed,
    gpt: gptResult,
  });
}

async function parseClovaText(rawText: string) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `한국 영수증을 OCR 한 raw 텍스트야. 가게명/날짜/품목/금액/합계 추출.

[OCR 텍스트]
${rawText}

[한국 마트 영수증 컬럼 구조]
한 줄 형식: <상품명> <단가> <수량> <금액>
예: "카스캔500ML  2,300  2  4,600"
- 단가: 1개당 가격 (보통 4자리+ 숫자, 쉼표 포함)
- 수량: 구매 개수 (보통 1~2자리 작은 숫자, 1/2/3 등)
- 금액: 단가×수량 = 그 품목의 총 금액 ⭐️ 이 값을 amount 로

⚠️ 수량(2 같은 작은 숫자)을 amount 로 읽으면 안 됨. **반드시 줄에서 가장 큰 숫자 = 그 품목 금액**.
⚠️ 합계(TOTAL/합계/총액/계) 줄은 items 에 포함 X.
⚠️ 부가세/봉투 같은 부수 항목도 items 에 포함 X (단, 별도 결제 항목이면 OK).

[검증]
- 모든 items.amount 합 ≈ total 이어야 함. 안 맞으면 amount 다시 골라.
- 추측 금지. 명확히 안 보이면 그 품목 생략.

응답:
{
  "store_name": "...",
  "date": "YYYY-MM-DD",
  "items": [{"name":"카스캔500ML", "amount":4600}],
  "total": 23710
}`,
        },
      ],
    });
    return JSON.parse(response.choices[0]?.message?.content ?? '{}');
  } catch {
    return null;
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
