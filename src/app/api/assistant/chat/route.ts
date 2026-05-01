export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ASSISTANT_TOOLS, executeTool } from '@/lib/assistant-tools';

dayjs.locale('ko');

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_TOOL_ROUNDS = 5; // 무한 loop 방지

type ChatMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessage: string = body.message;
    const history: ChatMessage[] = body.history ?? [];
    if (!userMessage || typeof userMessage !== 'string') {
      return NextResponse.json({ error: 'message 필요' }, { status: 400 });
    }

    const today = dayjs().format('YYYY년 M월 D일 (ddd)');
    const systemPrompt = `당신은 사용자의 일정/할일/시간 관리를 돕는 AI 어시스턴트입니다.
오늘은 ${today}입니다 (한국 시간).

원칙:
1. 사용자가 데이터에 대해 물어보면 항상 도구를 호출해서 실제 데이터를 확인한 뒤 답변하세요.
2. 일정 생성은 사용자가 명확히 "만들어줘", "추가해줘" 라고 했을 때만 create_task 호출.
3. 한국어로 친근하지만 군더더기 없이 짧게 답변. 이모지 적절히 사용.
4. 시간은 24시간제 (예: 14:30).
5. 데이터가 비어있으면 "기록이 없네요" 같이 솔직하게.
6. 패턴이나 추세를 발견하면 짧은 어드바이스도 한 줄 덧붙임.`;

    // OpenAI messages 배열 구성
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...(history as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
      { role: 'user', content: userMessage },
    ];

    let finalContent = '';
    const toolCallsLog: Array<{ name: string; args: unknown; result: unknown }> = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.5,
      });

      const msg = response.choices[0]?.message;
      if (!msg) break;

      // tool_calls 가 있으면 실행 후 다음 라운드
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content ?? '',
          tool_calls: msg.tool_calls,
        });
        for (const tc of msg.tool_calls) {
          if (tc.type !== 'function') continue;
          let parsedArgs: Record<string, unknown> = {};
          try {
            parsedArgs = JSON.parse(tc.function.arguments || '{}');
          } catch {
            /* ignore */
          }
          const result = await executeTool(
            HOUSEHOLD_ID,
            tc.function.name,
            parsedArgs,
          );
          toolCallsLog.push({
            name: tc.function.name,
            args: parsedArgs,
            result: result.ok ? '(ok)' : `(error: ${result.error})`,
          });
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      // 최종 답변
      finalContent = msg.content ?? '';
      break;
    }

    return NextResponse.json({
      ok: true,
      content: finalContent,
      tool_calls: toolCallsLog,
    });
  } catch (e) {
    console.error('[assistant/chat]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
