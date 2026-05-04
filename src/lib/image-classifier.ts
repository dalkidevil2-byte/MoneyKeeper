/**
 * 이미지 분류기 — 영수증 / 증권사 거래내역 / 리딩방 메시지 / 기타.
 * 텔레그램·AI 어시스턴트로 사진이 들어왔을 때 적절한 처리 경로로 라우팅하기 위함.
 *
 * 비용 절약 — gpt-4o-mini + detail:'low' 사용 (토큰 ~85개).
 */
import OpenAI from 'openai';
import { logAiUsage } from './ai-usage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ImageKind =
  | 'receipt'           // 영수증 / 카드 결제 캡쳐 / 가계부용
  | 'stock_brokerage'   // 증권사 거래내역 / 체결확인 / MTS 캡쳐
  | 'stock_recommendation' // 리딩방 / 추천 메시지 텍스트 캡쳐 (메모용)
  | 'other';

export async function classifyImage(
  imageUrl: string,
  caption?: string,
): Promise<{ kind: ImageKind; confidence: number; reason: string }> {
  const captionHint = caption ? `\n\n사용자가 적은 캡션: "${caption}"` : '';
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
          {
            type: 'text',
            text: `이 이미지가 어떤 종류인지 분류해 JSON 으로만 답해.

분류 기준:
- "receipt": 영수증, 카드 결제 화면, 카카오톡 결제 알림, 마트/카페/식당 영수증
- "stock_brokerage": 증권사 앱(키움/미래에셋/삼성/한투/토스증권/NH/신한 등) 의 체결확인/주문완료/거래내역/매매내역 화면. 종목명+수량+단가+매수/매도 형태가 명확히 보임.
- "stock_recommendation": 카카오톡/텔레그램 채팅에서 누군가가 추천한 매수/매도 메시지 텍스트. 리딩방, 종목 추천, "비중 N%" 같은 표현. 본인 거래 화면 X.
- "other": 위 어디에도 안 맞음

응답: { "kind": "receipt" | "stock_brokerage" | "stock_recommendation" | "other", "confidence": 0~1, "reason": "한 문장 짧게" }${captionHint}`,
          },
        ],
      },
    ],
  });

  void logAiUsage({
    model: 'gpt-4o-mini',
    feature: 'parse',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    meta: { kind: 'image_classify' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(raw);
    const kind = (
      ['receipt', 'stock_brokerage', 'stock_recommendation', 'other'].includes(parsed.kind)
        ? parsed.kind
        : 'other'
    ) as ImageKind;
    return {
      kind,
      confidence: Number(parsed.confidence) || 0.5,
      reason: String(parsed.reason ?? ''),
    };
  } catch {
    return { kind: 'other', confidence: 0, reason: 'JSON 파싱 실패' };
  }
}
