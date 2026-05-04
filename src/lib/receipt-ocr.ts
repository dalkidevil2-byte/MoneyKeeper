/**
 * 영수증 OCR — gpt-4o vision.
 * /api/transactions/ocr 와 텔레그램 webhook 이 공유하는 lib 함수.
 * (HTTP 거치지 않고 서버 내부에서 직접 호출)
 */
import OpenAI from 'openai';
import { createServerSupabaseClient } from './supabase';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import { logAiUsage } from './ai-usage';
import { isClovaConfigured, runClovaReceiptOcr } from './clova-ocr';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type ReceiptOcrItem = {
  name: string;
  amount: number;
  quantity?: number;
  unit?: string;
  category_main?: string;
  category_sub?: string;
};

export type ReceiptOcrResult = {
  store_name?: string;
  date?: string;
  items: ReceiptOcrItem[];
  total?: number;
  payment_hint?: string;
};

/**
 * Telegram CDN 등은 가끔 application/octet-stream 으로 응답함 → OpenAI 가 거부.
 * URL 확장자 우선, response header 는 fallback.
 */
/**
 * CLOVA 가 OCR 한 raw 텍스트 → gpt-4o-mini 로 구조 파싱 + 카테고리 분류.
 * 시각 인식 안 하니까 mini 로 충분.
 */
async function parseReceiptTextWithGPT(
  rawText: string,
  householdId: string,
): Promise<ReceiptOcrResult | null> {
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
      (m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m),
    ),
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `한국 영수증 OCR raw 텍스트 → 가게명/날짜/품목/금액/합계 + 카테고리.

[OCR 텍스트]
${rawText}

[참고]
- 한국 마트 영수증은 표 형식 (상품명 / 단가 / 수량 / 금액)
- OCR 가 컬럼별로 묶어 출력할 수 있음 → 같은 인덱스끼리 매칭
- amount = 그 품목의 총 금액 (단가×수량). 보통 줄에서 가장 큰 숫자.
- total = "결제금액"/"카드결제"/"총합계" 옆 숫자 중 가장 큰 값

[카테고리] ${allMains.join(', ')} 중 어울리는 것.

응답:
{
  "store_name": "...",
  "date": "YYYY-MM-DD",
  "items": [{"name":"...", "amount":숫자, "quantity":숫자, "category_main":"...", "category_sub":""}],
  "total": 숫자,
  "payment_hint": "현금/카드 등"
}`,
        },
      ],
    });
    void logAiUsage({
      model: 'gpt-4o-mini',
      feature: 'parse',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      householdId,
      meta: { kind: 'receipt_parse_from_clova_text' },
    });
    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as ReceiptOcrResult;
    return {
      store_name: parsed.store_name ?? '',
      date: parsed.date ?? '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      total: parsed.total,
      payment_hint: parsed.payment_hint,
    };
  } catch (e) {
    console.warn('[parseReceiptTextWithGPT]', e);
    return null;
  }
}

/**
 * CLOVA 가 추출한 raw 품목 → gpt-4o-mini 로 카테고리만 분류.
 * 시각 인식 안 하니까 mini 로 충분 + 매우 저렴.
 */
async function classifyItemsWithGPT(
  rawItems: Array<{ name: string; count?: number; unitPrice?: number; price: number }>,
  householdId: string,
): Promise<ReceiptOcrItem[]> {
  if (rawItems.length === 0) return [];

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
      (m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m),
    ),
  ];
  const subHints: Record<string, string[]> = {};
  for (const m of allMains) {
    const defaults = (CATEGORY_SUB_MAP as Record<string, readonly string[]>)[m] ?? [];
    const customs = (customCats ?? [])
      .filter((c) => c.category_main === m && c.category_sub)
      .map((c) => c.category_sub as string);
    subHints[m] = [...defaults, ...customs].filter(
      (s, i, arr) => arr.indexOf(s) === i,
    );
  }
  const guide = allMains
    .map((m) => `${m}${subHints[m]?.length ? `(${subHints[m].slice(0, 5).join(',')})` : ''}`)
    .join(', ');

  try {
    const itemsForPrompt = rawItems.map((r) => r.name).join('\n');
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: `다음 영수증 품목 ${rawItems.length}개를 카테고리 분류해. 입력 순서 그대로 categories 배열로.

품목:
${itemsForPrompt}

카테고리 가이드:
${guide}

응답:
{ "categories": [{"main": "식비", "sub": "마트"}, ...] }`,
        },
      ],
    });
    void logAiUsage({
      model: 'gpt-4o-mini',
      feature: 'parse',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      householdId,
      meta: { kind: 'receipt_categorize', items: rawItems.length },
    });
    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as { categories?: Array<{ main?: string; sub?: string }> };
    const cats = parsed.categories ?? [];
    return rawItems.map((r, i) => ({
      name: r.name,
      amount: r.price,
      quantity: r.count ?? 1,
      unit: '개',
      category_main: cats[i]?.main ?? '식비',
      category_sub: cats[i]?.sub ?? '',
    }));
  } catch (e) {
    console.warn('[receipt classify] fallback no-category', e);
    return rawItems.map((r) => ({
      name: r.name,
      amount: r.price,
      quantity: r.count ?? 1,
      unit: '개',
      category_main: '식비',
      category_sub: '',
    }));
  }
}

function inferImageMime(url: string, headerType?: string | null): string {
  const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const lower = url.toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.webp')) return 'image/webp';
  if (headerType && ALLOWED.includes(headerType)) return headerType;
  return 'image/jpeg'; // 안전 기본값
}

function extractJSON(raw: string): string {
  let s = raw.replace(/```json\n?|```/g, '').trim();
  const start = s.indexOf('{');
  if (start === -1) return s;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return s.slice(start);
}

export async function runReceiptOcr(
  imageUrl: string,
  householdId: string,
): Promise<ReceiptOcrResult> {
  // 외부 URL → base64 다운로드
  let finalUrl = imageUrl;
  if (imageUrl.startsWith('http')) {
    try {
      const r = await fetch(imageUrl);
      if (r.ok) {
        const ab = await r.arrayBuffer();
        const b64 = Buffer.from(ab).toString('base64');
        const mt = inferImageMime(imageUrl, r.headers.get('content-type'));
        finalUrl = `data:${mt};base64,${b64}`;
      }
    } catch {
      /* keep */
    }
  }

  // ─── CLOVA OCR 우선 (한국어 텍스트 추출 정확도 ↑) ───
  if (isClovaConfigured()) {
    const clova = await runClovaReceiptOcr(finalUrl);
    if (clova && clova.rawText && clova.rawText.length > 30) {
      // CLOVA 가 추출한 raw 텍스트 → gpt-4o-mini 가 구조 파싱
      const structured = await parseReceiptTextWithGPT(clova.rawText, householdId);
      if (structured && structured.items.length > 0) {
        void logAiUsage({
          model: 'clova-ocr',
          feature: 'ocr',
          meta: { kind: 'receipt', source: 'clova+gpt-mini', items: structured.items.length },
        });
        return structured;
      }
    }
    console.warn('[receipt-ocr] CLOVA empty or parse fail, fallback to gpt-4o vision');
  }

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
      (m) => !(CATEGORY_MAIN_OPTIONS as readonly string[]).includes(m),
    ),
  ];

  const subHints: Record<string, string[]> = {};
  for (const m of allMains) {
    const defaults = (CATEGORY_SUB_MAP as Record<string, readonly string[]>)[m] ?? [];
    const customs = (customCats ?? [])
      .filter((c) => c.category_main === m && c.category_sub)
      .map((c) => c.category_sub as string);
    const merged = [...defaults, ...customs].filter(
      (s, i, arr) => arr.indexOf(s) === i,
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
          { type: 'image_url', image_url: { url: finalUrl, detail: 'high' } },
          {
            type: 'text',
            text: `이 영수증 이미지에서 구매 내역을 추출해 JSON으로만 응답해 (마크다운 코드블록 절대 금지, 순수 JSON 1개만).

스키마:
{
  "store_name": "가게명",
  "date": "YYYY-MM-DD 형식. 영수증에서 명확히 읽을 수 있을 때만 기입. 읽을 수 없으면 반드시 빈 문자열로. 과거·미래 추정 금지.",
  "items": [
    {
      "name": "상품명 (용량/규격 포함)",
      "amount": 숫자,
      "quantity": 숫자,
      "unit": "구매 단위 (개/캔/병/봉/팩 중 적절. 기본 개)",
      "category_main": "다음 중 하나만: ${allMains.join(', ')}",
      "category_sub": "선택사항"
    }
  ],
  "total": 숫자,
  "payment_hint": "현금/카드/계좌이체/카카오페이 등 (없으면 '')"
}

카테고리 가이드 (대분류(소분류 예시들)):
${categoryGuide}

규칙:
- 금액은 숫자만
- 영수증이 아니거나 글씨가 안 보이면 items를 빈 배열로`,
          },
        ],
      },
    ],
  });

  void logAiUsage({
    model: 'gpt-4o',
    feature: 'ocr',
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    householdId,
    meta: { kind: 'receipt' },
  });

  const raw = response.choices[0]?.message?.content ?? '{}';
  const cleaned = extractJSON(raw);
  try {
    const parsed = JSON.parse(cleaned) as ReceiptOcrResult;
    return {
      store_name: parsed.store_name ?? '',
      date: parsed.date ?? '',
      items: Array.isArray(parsed.items) ? parsed.items : [],
      total: parsed.total,
      payment_hint: parsed.payment_hint,
    };
  } catch (e) {
    console.error('[receipt OCR parse fail]', e, raw.slice(0, 200));
    return { store_name: '', date: '', items: [] };
  }
}
