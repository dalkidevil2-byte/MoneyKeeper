import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const base64 = formData.get('base64') as string | null;
    const mimeType = (formData.get('mimeType') as string) || 'image/jpeg';

    let imageUrl: string;
    if (base64) {
      imageUrl = `data:${mimeType};base64,${base64}`;
    } else if (file) {
      const buf = await file.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      imageUrl = `data:${file.type};base64,${b64}`;
    } else {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'high' },
            },
            {
              type: 'text',
              text: `이 영수증 이미지에서 구매 내역을 추출해줘.

다음 JSON 형식으로만 응답해 (마크다운 없이 순수 JSON):
{
  "store_name": "가게명",
  "date": "YYYY-MM-DD (없으면 오늘 날짜)",
  "items": [
    {
      "name": "상품명 (용량/규격 포함, 예: 맥주 500ml, 우유 1L, 계란 30구)",
      "amount": 숫자 (해당 품목 총 금액, 원 단위),
      "quantity": 숫자 (구매 개수, 기본 1),
      "unit": "구매 단위 (개/캔/병/봉/팩/박스/장/g/kg/ml/L/구 중 가장 적절한 것, 기본 개)",
      "category_main": "카테고리 (식비/생활/카페/교통/쇼핑/의료/교육/취미/육아/기타 중 하나)"
    }
  ],
  "total": 숫자 (합계 금액),
  "payment_hint": "현금/카드/카카오페이 등 결제수단 텍스트 (없으면 빈 문자열)"
}

규칙:
- 금액은 숫자만 (쉼표/원 제외)
- amount는 quantity × 단가 (예: 맥주 2캔 10,000원이면 amount=10000, quantity=2, unit=캔)
- 할인/적립은 별도 항목으로 추가 (amount는 음수)
- 합계(TOTAL) 줄은 items에 포함하지 마
- 영수증이 아닌 이미지면 items를 빈 배열로`,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return NextResponse.json({ result: parsed });
  } catch (err: any) {
    console.error('[OCR]', err);
    return NextResponse.json({ error: err.message ?? 'OCR 오류' }, { status: 500 });
  }
}
