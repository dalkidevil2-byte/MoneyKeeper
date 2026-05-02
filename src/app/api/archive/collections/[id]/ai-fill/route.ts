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
 * body: { text: string }
 * 사용자가 자유롭게 적은 텍스트를 컬렉션 schema 에 맞춰 data 객체로 파싱.
 * **DB 저장 안 함** — 사용자가 검토 후 저장.
 *
 * 응답: { data: { key1: value1, ... }, filled: string[], missing: string[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const text: string = body.text ?? '';
    if (!text.trim()) {
      return NextResponse.json({ error: '텍스트를 입력해주세요.' }, { status: 400 });
    }

    const { data: col } = await supabase
      .from('archive_collections')
      .select('name, description, schema')
      .eq('id', id)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    const schema = (col.schema ?? []) as ArchiveProperty[];

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

    const systemPrompt = `당신은 사용자가 자유롭게 적은 텍스트를 데이터베이스 항목 양식에 맞춰 자동으로 분류·입력하는 도우미입니다.
컬렉션: "${col.name}"${col.description ? ` (${col.description})` : ''}

다음 schema 의 key 들을 채워야 합니다:
${schemaGuide}

규칙:
- 응답은 JSON 만 (마크다운 코드블록 X). 형식: {"data": {key1: value1, ...}}
- 텍스트에서 명확히 알 수 있는 값만 채움. 추측·환각 금지.
- 모르는 필드는 빈 문자열 "" 또는 생략.
- date 타입은 YYYY-MM-DD 형식. "어제/오늘/3월 5일" 같은 자연어는 적절히 변환.
- number / currency 타입은 숫자만 (쉼표/원/$ 제거).
- select 타입은 반드시 옵션 중 하나만. 매칭 안 되면 빈 값.
- multiselect 는 옵션 중 해당하는 것들 배열.
- rating 은 1~5 정수. "별 4개", "★★★", "9/10" 같은 표현 적절히 변환.
- checkbox 는 true/false.
- url 은 http(s):// 시작.
- longtext 는 여러 줄 가능. 메모/감상/요약 등.
- checklist 는 [{label, done}] 객체 배열. 텍스트가 "준비물 리스트", "할일 목록" 같으면
  각 항목을 분리해서 label 로. done 은 명시적으로 "완료/체크" 라고 안 쓰면 false.
  예: "여행 준비물: 여권, 충전기, 옷" → [{label:"여권",done:false},{label:"충전기",done:false},{label:"옷",done:false}]
- 첫 속성(보통 제목)은 가능한 한 채움. 텍스트의 핵심을 요약.
- 사용자가 "여행/등산/출장/X 준비물" 처럼 구체적 목적지를 말하면, 그 목적에 맞는
  현실적 준비물 목록을 checklist 로 자동 생성해도 됨 (단, 기본 입력 텍스트 안의
  내용을 우선).

지원 타입: text, longtext, number, currency, date, url, select, multiselect, rating, checkbox, files, checklist`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: text.trim(),
        },
      ],
      temperature: 0.3,
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
      } else if (p.type === 'checklist') {
        // [{label, done}] 형식 검증 + 정리
        if (Array.isArray(v)) {
          const items = v
            .map((it) => {
              if (!it) return null;
              if (typeof it === 'string') return { label: it, done: false };
              if (typeof it === 'object') {
                const item = it as { label?: unknown; done?: unknown };
                const label = String(item.label ?? '').trim();
                if (!label) return null;
                return { label, done: Boolean(item.done) };
              }
              return null;
            })
            .filter(Boolean);
          if (items.length > 0) cleanData[p.key] = items;
        } else if (typeof v === 'string') {
          // "a, b, c" 또는 줄바꿈 분리 string 도 허용
          const items = v
            .split(/[,\n]+/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((label) => ({ label, done: false }));
          if (items.length > 0) cleanData[p.key] = items;
        }
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
