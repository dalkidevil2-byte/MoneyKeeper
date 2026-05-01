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
  imageUrl?: string,
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

D) **create_archive_collection** — 사용자가 "X 컬렉션/페이지/목록 만들어줘" 라고 하면.
   주제에 맞는 이모지·색상·속성 3~7개 추론 (예: 와인 노트 → 이름/와이너리/품종/연도/평점/메모).
   첫 속성은 항상 제목/이름 역할 (text, required).
   날짜는 'date', 금액은 'currency', 등급은 'rating' (1~5), 분류는 'select' + options.
   key 는 영문 snake_case, label 은 한글.

E) **save_stock_recommendation** — 주식 추천/리딩방/매매 메시지 자동 저장:
   - 트리거: "매수", "매도", "비중 N%", "신규편입", "정리", "리딩방", "<무임승차>" 같은 단어 + 종목명/코드 패턴
   - 예시 입력:
     "1. SNT에너지(100840) 55000~56000원 비중 10% 매수
      2. LS마린솔루션 37000~38000원 5~7% 신규매수
      3. 만도 정리하고 포스코DX 신규로 담아봅니다"
   - → entries 배열로 분리: 종목당 하나, ticker_name + content + action(buy/sell/watch/hold)
   - 메시지에 포함된 괄호 안 6자리 숫자(예: 100840)는 ticker 코드. 없으면 ticker 비워둠 (서버가 KRX 매칭).
   - "정리" / "매도" → action: sell, "신규" / "매수" → buy, "관심" / "주목" → watch
   - 저장 후 "✅ N개 종목 메모 저장: 종목A(매수), 종목B(매도)..." 형태로 짧게 응답
   - 매칭 실패한 종목이 있으면 "⚠️ X 종목은 KRX 매칭 안됨" 으로 알림

F) **get_stock_recommendations** — 종목별 저장된 추천 메모 조회:
   - 트리거: "X 메모/추천 알려줘", "X 관련 메시지", "최근 받은 추천", "X 어떻게 했었지?"
   - 응답 형식: 날짜 내림차순으로 정리. 각 블록마다 [YYYY-MM-DD] 액션태그 — 본문(1~2줄)
   - 예시 응답:
     "📊 만도 (KS) — 총 3건
     • [2026-05-01] 🔴 매도추천 · 무임승차 — 정리하고 포스코DX로 갈아타기
     • [2026-04-15] 👀 관심 · 리딩방 — 실적 발표 앞두고 주목
     • [2026-03-20] 🟢 매수추천 — 35000원 분할매수"
   - 너무 많으면 최신 5~6건만, "더 보려면 X 메모 전체 보여줘" 안내

G) 이미지가 첨부됐을 때 — 자동 분류:
   - 증권사 체결확인/거래내역 화면 → 종목/수량/단가/수수료/세금 추출해서
     "📷 인식: 종목 X 매수 N주 @ P원 — /stocks/transactions 에서 검토 후 등록"
     형태로 안내. **자동 등록은 하지 말 것** (사용자가 검토해야 함).
   - 영수증 → 가맹점/금액/카테고리 추출해서 create_transaction 호출 (status: 'draft' 권장).
   - 리딩방/카톡/텔레그램 캡쳐 (종목명·매수/매도 메시지) → 텍스트 추출해서
     save_stock_recommendation 호출.
   - 일반 사진/문서 → 사용자 질문에 맞춰 답변.

H) 그 외는 데이터 조회/분석 도구 사용.`;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] | string = imageUrl
    ? [
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        { type: 'text', text: userMessage || '이 이미지를 분석해줘' },
      ]
    : userMessage;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...(history as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
    { role: 'user', content: userContent },
  ];

  const toolCalls: Array<{ name: string; args: unknown }> = [];
  let finalContent = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await openai.chat.completions.create({
      // 이미지 첨부된 첫 라운드는 gpt-4o(vision 정확도) 사용, 이후 라운드는 mini
      model: imageUrl && round === 0 ? 'gpt-4o' : 'gpt-4o-mini',
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
