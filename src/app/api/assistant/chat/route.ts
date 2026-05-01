export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { runAssistant, type ChatHistoryItem } from '@/lib/assistant-chat';

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
