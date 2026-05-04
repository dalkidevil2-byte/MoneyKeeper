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
          content: `한국 영수증 OCR raw 텍스트. CLOVA general OCR 은 컬럼이 흩어져서 한 행이 안 합쳐질 수 있음.

[OCR 텍스트]
${rawText}

[중요 — 컬럼 흩어짐 처리]
한국 마트 영수증은 표 형식 (상품명 / 단가 / 수량 / 금액).
OCR 텍스트에서 다음 패턴 가능:
1) 정상 줄 합쳐진 경우: "카스캔500ML 2,300 2 4,600"
2) 컬럼별로 묶여 있는 경우 (자주 발생):
   - 상품명들: "카스캔500ML 진로 비비고... 클라우드..."
   - 단가들: "2,300 1,390 7,480 1,380..."
   - 수량들: "2 1 1 1..."
   - 금액들: "4,600 1,290 7,480 1,380..."
   → 같은 인덱스끼리 매칭 (i번째 상품 - i번째 금액)

[금액 식별 규칙]
- "금액" 또는 영수증 끝 컬럼에 있는 숫자 = item.amount
- "단가" 컬럼 숫자 X. "수량" (작은 정수) X.
- "총합계" / "결제금액" / "총액" 키워드 옆 숫자 = total
- 영수증에 "총합계 23,710원" / "결제금액 14,850원" 둘 다 있으면 → total = 23710 (할인 전 합계)

[검증 — 매우 중요]
- items.amount 합 ≈ total 이어야 정상. 차이가 ±5% 이상이면 매칭 잘못된 것.
- 예: 합계가 23,710 인데 items 합이 11 이면 → 수량(1,2,...) 을 amount 로 잘못 읽은 것. 다시 매칭.
- 결제금액은 할인 후라 items 합과 안 맞을 수 있음 — total 은 할인 전 총합계 사용.

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
