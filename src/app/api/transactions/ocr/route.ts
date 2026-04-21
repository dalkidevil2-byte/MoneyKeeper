export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/lib/supabase';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 응답에서 첫 번째 JSON 객체를 추출. 모델이 마크다운/잡설을 섞어도 견고하게 동작.
 */
function extractJSON(raw: string): string {
  // 1) 마크다운 펜스 제거
  let s = raw.replace(/```json\n?|```/g, '').trim();
  // 2) 첫 '{' 부터 짝맞는 '}' 까지 추출
  const start = s.indexOf('{');
  if (start === -1) return s;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const base64 = formData.get('base64') as string | null;
    const mimeType = (formData.get('mimeType') as string) || 'image/jpeg';
    const householdId = (formData.get('household_id') as string) || DEFAULT_HOUSEHOLD_ID;

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

    // ─── 동적 카테고리: 기본 + custom_categories 머지 ─────────
    const supabase = createServerSupabaseClient();
    const { data: customCats } = await supabase
      .from('custom_categories')
      .select('category_main, category_sub')
      .eq('household_id', householdId);

    const customMains = (customCats ?? [])
      .map((c) => c.category_main)
      .filter((m, i, arr) => m && arr.indexOf(m) === i);
    const allMains = [
      ...CATEGORY_MAIN_OPTIONS.filter((m) => m !== '수입'),
      ...customMains.filter(
        (m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m)
      ),
    ];

    // 카테고리별 소분류 힌트 (대분류 → 소분류 후보)
    const subHints: Record<string, string[]> = {};
    for (const m of allMains) {
      const defaults = (CATEGORY_SUB_MAP as Record<string, readonly string[]>)[m] ?? [];
      const customs = (customCats ?? [])
        .filter((c) => c.category_main === m && c.category_sub)
        .map((c) => c.category_sub as string);
      const merged = [...defaults, ...customs].filter(
        (s, i, arr) => arr.indexOf(s) === i
      );
      if (merged.length) subHints[m] = merged;
    }

    const categoryGuide = allMains
      .map((m) => `${m}${subHints[m]?.length ? `(${subHints[m].slice(0, 6).join(',')})` : ''}`)
      .join(', ');

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
              text: `이 영수증 이미지에서 구매 내역을 추출해 JSON으로만 응답해 (마크다운 코드블록 절대 금지, 순수 JSON 1개만).

스키마:
{
  "store_name": "가게명",
  "date": "YYYY-MM-DD 형식. 영수증에서 명확히 읽을 수 있을 때만 기입. 읽을 수 없으면 반드시 빈 문자열로. 과거·미래 추정 금지.",
  "items": [
    {
      "name": "상품명 (용량/규격 포함 — 예: 맥주 500ml, 우유 1L, 계란 30구)",
      "amount": 숫자 (해당 품목 총 금액, 원),
      "quantity": 숫자 (구매 개수 또는 용량값. 주유는 1.5 같은 소수 가능),
      "unit": "구매 단위 (개/캔/병/봉/팩/박스/장/g/kg/ml/L/구 중 가장 적절. 기본 개)",
      "category_main": "다음 중 하나만 선택: ${allMains.join(', ')}",
      "category_sub": "선택사항. 대분류에 어울리는 세부 분류"
    }
  ],
  "total": 숫자,
  "payment_hint": "현금/카드/계좌이체/카카오페이 등 (없으면 '')"
}

카테고리 가이드 (대분류(소분류 예시들)):
${categoryGuide}

규칙:
- 금액은 숫자만 (쉼표/원 제외)
- amount = quantity × 단가
- 할인·적립은 amount 음수로 별도 항목
- 합계(TOTAL) 줄은 items에 포함하지 마
- 영수증이 아니거나 글씨가 안 보이면 items를 빈 배열로
- 주유 같은 소수 수량 입력 시 quantity는 정수가 아니어도 됨 (예: 38.42)`,
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = extractJSON(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[OCR JSON parse fail]', parseErr, raw.slice(0, 500));
      return NextResponse.json(
        {
          error: 'OCR 응답을 해석하지 못했습니다. 다시 시도해주세요.',
          raw: raw.slice(0, 500),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OCR 오류';
    console.error('[OCR]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
