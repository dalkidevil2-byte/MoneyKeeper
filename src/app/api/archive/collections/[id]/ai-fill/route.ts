export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createServerSupabaseClient } from '@/lib/supabase';
import type { ArchiveProperty } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

/**
 * POST /api/archive/collections/[id]/ai-fill
 * 이미지(영수증/책 표지/와인 라벨/드라마 포스터 등) → 컬렉션 schema 에 맞춰
 * data 객체 파싱. **DB 저장 안 함** — 사용자가 검토 후 저장.
 *
 * multipart/form-data: file (이미지)
 * 또는 JSON: { imageUrl }
 *
 * 응답: { data: { key1: value1, ... }, missing: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let imageUrl = '';

    if (contentType.includes('multipart/form-data')) {
      const fd = await req.formData();
      const file = fd.get('file') as File | null;
      const b64 = fd.get('base64') as string | null;
      const mt = (fd.get('mimeType') as string) || 'image/jpeg';
      if (b64) {
        imageUrl = `data:${mt};base64,${b64}`;
      } else if (file) {
        const buf = await file.arrayBuffer();
        const enc = Buffer.from(buf).toString('base64');
        imageUrl = `data:${file.type || 'image/jpeg'};base64,${enc}`;
      }
    } else {
      const body = await req.json();
      if (body.imageUrl) imageUrl = body.imageUrl as string;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }

    // 컬렉션 + schema 가져오기
    const { data: col } = await supabase
      .from('archive_collections')
      .select('name, description, schema')
      .eq('id', id)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    const schema = (col.schema ?? []) as ArchiveProperty[];

    // schema 를 LLM 이 이해하기 쉬운 가이드로 변환
    const schemaGuide = schema
      .map((p) => {
        let guide = `  - ${p.key} (${p.type}): "${p.label}"`;
        if (p.options && p.options.length > 0) {
          guide += ` — 옵션: ${p.options.join(', ')}`;
        }
        if (p.required) guide += ' [필수]';
        return guide;
      })
      .join('\n');

    const systemPrompt = `당신은 이미지를 보고 사용자의 데이터베이스 항목 양식에 맞게 정보를 추출하는 OCR 도우미입니다.
컬렉션: "${col.name}"${col.description ? ` (${col.description})` : ''}

다음 schema 의 key 들을 채워야 합니다:
${schemaGuide}

규칙:
- 응답은 JSON 만 (마크다운 코드블록 X). 형식: {"data": {key1: value1, ...}}
- 이미지에서 명확히 읽을 수 있는 값만 채움. 추측·환각 금지.
- 모르는 필드는 빈 문자열 "" 또는 생략.
- date 타입은 YYYY-MM-DD 형식.
- number / currency 타입은 숫자만 (쉼표/원/$ 제거).
- select 타입은 반드시 옵션 중 하나만. 매칭 안 되면 빈 값.
- multiselect 는 옵션 중 해당하는 것들 배열.
- rating 은 1~5 정수. 이미지에 평점/별점 보이지 않으면 비워둠.
- checkbox 는 true/false.
- url 은 http(s):// 시작.
- longtext 는 여러 줄 가능.

지원 타입: text, longtext, number, currency, date, url, select, multiselect, rating, checkbox`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
            {
              type: 'text',
              text: '이 이미지에서 정보를 추출해서 JSON 으로 응답해.',
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = extractJSON(raw);
    let parsed: { data?: Record<string, unknown> };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'AI 응답 파싱 실패', raw: raw.slice(0, 500) },
        { status: 502 },
      );
    }

    const filledData = parsed.data ?? {};
    // schema 에 없는 키 제거 + 타입 정리
    const cleanData: Record<string, unknown> = {};
    for (const p of schema) {
      const v = filledData[p.key];
      if (v == null || v === '') continue;
      if (p.type === 'number' || p.type === 'currency') {
        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.-]/g, ''));
        if (Number.isFinite(n)) cleanData[p.key] = n;
      } else if (p.type === 'rating') {
        const n = typeof v === 'number' ? v : parseInt(String(v), 10);
        if (Number.isFinite(n)) cleanData[p.key] = Math.max(1, Math.min(5, n));
      } else if (p.type === 'checkbox') {
        cleanData[p.key] = Boolean(v);
      } else if (p.type === 'multiselect') {
        cleanData[p.key] = Array.isArray(v) ? v : [String(v)];
      } else {
        cleanData[p.key] = v;
      }
    }

    const filled = Object.keys(cleanData);
    const missing = schema.filter((p) => !filled.includes(p.key)).map((p) => p.label);

    return NextResponse.json({ data: cleanData, filled, missing });
  } catch (e) {
    console.error('[archive/ai-fill]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
