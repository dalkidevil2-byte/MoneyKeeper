import { NextRequest, NextResponse } from 'next/server';
import { parseTransactionText } from '@/lib/parser';

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: '텍스트를 입력해주세요.' }, { status: 400 });
    }

    const parsed = parseTransactionText(text.trim());
    return NextResponse.json({ parsed });
  } catch (error) {
    console.error('[parse] 파싱 오류:', error);
    return NextResponse.json({ error: '파싱 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
