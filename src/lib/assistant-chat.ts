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
  const systemPrompt = `당신은 사용자의 일정/할일/시간/가계부를 돕는 AI 어시스턴트입니다.
오늘은 ${today}입니다 (한국 시간).

원칙:
1. 사용자가 데이터에 대해 물어보면 항상 도구를 호출해서 실제 데이터 확인 후 답변.
2. 한국어 친근, 짧게. 이모지 적절. 시간은 24시간제 (예: 14:30).
3. 데이터 없으면 솔직하게 "기록이 없네요". 추세 발견하면 짧은 어드바이스 한 줄.
4. 텔레그램 봇 응답은 3~5줄 내.

⚠️ 도구 선택 규칙 — 매우 중요:

A) **create_transaction (가계부 거래)** 호출 케이스:
   - 메시지에 금액(원/만원/천원/$ 등) + 가게/장소/물건이 있으면 거래
   - 예시: "올리브영 2만원" / "편의점에서 5천원" / "마트 35000" / "월급 300" /
     "스타벅스 6500원 라떼" / "어제 미용실 80000" / "택시비 12000"
   - 시간(HH:MM)이 없으면 = 거래일 가능성 높음
   - "썼어", "샀어", "결제했어", "받았어" 등 거래 동사

B) **create_task (일정/할일)** 호출 케이스:
   - 시간(HH:MM) 또는 날짜(내일, 다음주 화요일) + 행동/활동
   - 예시: "내일 9시에 회의" / "다음주 월요일 미용실 예약" /
     "오늘 7시 운동" / "이번주 안에 보고서 끝내기"
   - 미래 시점 + 약속/할일 형태

C) 모호하면 사용자에게 물어보기:
   - "마트에서 5만원 (산 건지 / 가는 일정인지)" 같은 경우

D) 그 외는 데이터 조회/분석 도구 사용.`;

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
