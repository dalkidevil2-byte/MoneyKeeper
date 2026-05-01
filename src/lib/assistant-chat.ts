/**
 * AI 어시스턴트 채팅 핵심 로직 — chat 라우트와 텔레그램 webhook 양쪽이 공유.
 */

import OpenAI from 'openai';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { ASSISTANT_TOOLS, executeTool } from './assistant-tools';

dayjs.locale('ko');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MAX_TOOL_ROUNDS = 5;

export type ChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export async function runAssistant(
  householdId: string,
  userMessage: string,
  history: ChatHistoryItem[],
): Promise<{ content: string; tool_calls: Array<{ name: string; args: unknown }> }> {
  const today = dayjs().format('YYYY년 M월 D일 (ddd)');
  const systemPrompt = `당신은 사용자의 일정/할일/시간 관리를 돕는 AI 어시스턴트입니다.
오늘은 ${today}입니다 (한국 시간).

원칙:
1. 사용자가 데이터에 대해 물어보면 항상 도구를 호출해서 실제 데이터를 확인한 뒤 답변하세요.
2. 일정 생성은 사용자가 명확히 "만들어줘", "추가해줘" 라고 했을 때만 create_task 호출.
3. 한국어로 친근하지만 군더더기 없이 짧게 답변. 이모지 적절히 사용.
4. 시간은 24시간제 (예: 14:30).
5. 데이터가 비어있으면 "기록이 없네요" 같이 솔직하게.
6. 패턴이나 추세를 발견하면 짧은 어드바이스도 한 줄 덧붙임.
7. 텔레그램 봇 응답은 짧고 핵심만 (3~5줄 내).`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...(history as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    { role: 'user', content: userMessage },
  ];

  const toolCalls: Array<{ name: string; args: unknown }> = [];
  let finalContent = '';

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
        const result = await executeTool(householdId, tc.function.name, parsedArgs);
        toolCalls.push({ name: tc.function.name, args: parsedArgs });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    finalContent = msg.content ?? '';
    break;
  }

  return { content: finalContent, tool_calls: toolCalls };
}
