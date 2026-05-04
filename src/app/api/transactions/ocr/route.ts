export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { runReceiptOcr } from '@/lib/receipt-ocr';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/transactions/ocr
 *
 * 영수증 OCR — lib/receipt-ocr.ts 의 runReceiptOcr 위임.
 * - CLOVA configured → CLOVA 텍스트 추출 + gpt-4o-mini 구조 파싱
 * - 미설정 또는 실패 → gpt-4o vision fallback
 *
 * 입력:
 *   - JSON: { imageUrl, household_id }
 *   - FormData: file 또는 base64 + mimeType, household_id
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
      imageUrl = body.imageUrl;
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
        imageUrl = `data:${file.type || 'image/jpeg'};base64,${b64}`;
      } else {
        return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
      }
    }

    const result = await runReceiptOcr(imageUrl, householdId);
    return NextResponse.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OCR 오류';
    console.error('[OCR]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
