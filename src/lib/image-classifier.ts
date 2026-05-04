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

  // 외부 URL (텔레그램 CDN 등) → base64 로 변환해 OpenAI 가 직접 디코드하도록
  let finalUrl = imageUrl;
  if (imageUrl.startsWith('http')) {
    try {
      const r = await fetch(imageUrl);
      if (r.ok) {
        const ab = await r.arrayBuffer();
        const b64 = Buffer.from(ab).toString('base64');
        const mt = r.headers.get('content-type') ?? 'image/jpeg';
        finalUrl = `data:${mt};base64,${b64}`;
      }
    } catch {
      /* keep original */
    }
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 200,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: finalUrl, detail: 'low' } },
          {
            type: 'text',
            text: `이 이미지가 어떤 종류인지 분류해 JSON 으로만 답해.

분류 기준 (시각적 차이로 판별):

▪ "receipt" — 영수증 / 카드결제 알림 / 마트·카페·식당 거래
  - 흰배경 종이 / 카드사 SMS-style / 가맹점명 + 금액 + 날짜
  - 카드결제 카톡/문자 알림 ("스타벅스 7,500원 결제")

▪ "stock_brokerage" — **본인 증권사 앱 거래화면**
  - 키움/미래에셋/삼성/한투/토스증권/NH/신한투자/KB증권/카카오뱅크증권 등의 앱 UI
  - "체결확인" / "주문완료" / "거래내역" / "매매내역" / "구매 완료" / "판매 완료" 같은 헤더
  - 종목코드(6자리) + 수량 + 단가 + 매수/매도/구매/판매 표·리스트 형식
  - 토스증권은 "구매/판매" 표현 사용. 카카오뱅크증권은 "사기/팔기".
  - 깔끔한 표/카드 형태, 말풍선 X

▪ "stock_recommendation" — **메신저 대화방 캡쳐 (말풍선 형태)**
  - 카카오톡/텔레그램/디스코드 등 채팅 UI 명확히 보임
  - 말풍선 안에 누군가가 추천한 매수/매도 메시지
  - "비중 N%", "신규편입", "리딩방", "정리", "<무임승차>" 같은 표현
  - 채팅 시간 (오후 3:24 같은) / 프로필 이미지 / 톡방 이름
  - 본인 거래 결과가 아닌, 누군가가 작성한 "텍스트 메시지" 캡쳐

▪ "other" — 위 어디에도 안 맞음

핵심 차이:
- 증권사 캡쳐 = 표/리스트/숫자 / 앱 UI
- 추천 메시지 = 말풍선 / 톡방 UI / 자연어 문장

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
