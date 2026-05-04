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

  // 병렬 실행
  const [clovaResult, gptResult] = await Promise.all([
    isClovaConfigured() ? runClovaReceiptOcr(dataUrl).catch(() => null) : Promise.resolve(null),
    runGptOnly(dataUrl).catch(() => null),
  ]);

  return NextResponse.json({
    clova_configured: isClovaConfigured(),
    clova: clovaResult,
    gpt: gptResult,
  });
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
