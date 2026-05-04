export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/transactions/ocr-debug
 * CLOVA 환경변수 / 기본 호출 진단.
 */
export async function GET() {
  const url = process.env.CLOVA_OCR_INVOKE_URL;
  const secret = process.env.CLOVA_OCR_SECRET_KEY;

  const status = {
    has_url: !!url,
    has_secret: !!secret,
    url_preview: url ? `${url.slice(0, 40)}...` : null,
    secret_length: secret?.length ?? 0,
    secret_preview: secret ? `${secret.slice(0, 4)}...${secret.slice(-4)}` : null,
  };

  if (!url || !secret) {
    return NextResponse.json({
      ok: false,
      error: '환경변수 누락',
      status,
    });
  }

  // 빈 호출로 응답 형태 확인 (이미지 없이도 에러 메시지 형태로 반응)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-OCR-SECRET': secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'V2',
        requestId: 'debug',
        timestamp: Date.now(),
        images: [
          {
            format: 'jpg',
            name: 'debug',
            // 1x1 흰색 jpeg base64 (가장 작은 유효 이미지)
            data:
              '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==',
          },
        ],
      }),
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* keep raw */
    }

    return NextResponse.json({
      ok: res.ok,
      http_status: res.status,
      response: parsed ?? text.slice(0, 1000),
      status,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      status,
    });
  }
}
