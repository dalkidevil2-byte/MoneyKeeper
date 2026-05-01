export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { runAssistant, type ChatHistoryItem } from '@/lib/assistant-chat';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage: string = body.message;
    const history: ChatHistoryItem[] = body.history ?? [];
    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'message 필요' }, { status: 400 });
    }
    const { content, tool_calls } = await runAssistant(
      HOUSEHOLD_ID,
      userMessage,
      history,
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
