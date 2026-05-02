export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';
import type { ArchiveProperty } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_TYPES = [
  'text', 'longtext', 'number', 'currency',
  'date', 'url', 'select', 'multiselect',
  'rating', 'checkbox', 'files', 'checklist',
] as const;

/**
 * POST /api/archive/collections/[id]/ai-property
 * body: { intent: '시청 날짜와 함께 본 사람' }
 * → LLM 이 1~3개 속성 추론 → 컬렉션 schema 에 append → 추가된 속성 반환
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const intent: string = body.intent;
    if (!intent || !intent.trim()) {
      return NextResponse.json({ error: 'intent 필요' }, { status: 400 });
    }

    // 현재 컬렉션 + schema
    const { data: col } = await supabase
      .from('archive_collections')
      .select('name, description, schema')
      .eq('id', id)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    const currentSchema = (col.schema ?? []) as ArchiveProperty[];
    const existingKeys = new Set(currentSchema.map((p) => p.key));

    const systemPrompt = `당신은 노션 같은 데이터베이스의 속성 디자이너입니다.
사용자가 "이런 속성을 추가하고 싶다" 라고 자연어로 적으면, 1~3개의 적절한 속성을 추론해서 JSON 배열로 응답합니다.

지원 타입: ${ALLOWED_TYPES.join(', ')}
- 날짜는 'date'
- 금액은 'currency' (원 단위)
- 분류·등급은 'select' + options 배열
- 다중 선택은 'multiselect' + options
- 평가/별점은 'rating' (1~5)
- 긴 글은 'longtext'
- 짧은 텍스트는 'text'
- 링크는 'url'
- 예/아니오는 'checkbox'

규칙:
- key 는 영문 snake_case (한글 단어는 의미 살려 영문으로 — 예: '함께 본 사람' → 'watched_with')
- label 은 한글
- 기존 키 [${[...existingKeys].join(', ')}] 와 중복 금지
- options 는 select / multiselect 일 때만, 일반적으로 3~6개
- 응답은 JSON 만, 다른 설명 X. 형식: {"properties":[{...}]}`;

    const userPrompt = `컬렉션: "${col.name}"${col.description ? ` (${col.description})` : ''}
기존 속성: ${currentSchema.map((p) => `${p.label}(${p.type})`).join(', ') || '없음'}

추가하고 싶은 것: ${intent.trim()}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    let parsed: { properties?: ArchiveProperty[] };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
    }
    const newProps = (parsed.properties ?? []).filter((p) => {
      if (!p?.key || !p?.label || !p?.type) return false;
      if (!(ALLOWED_TYPES as readonly string[]).includes(p.type)) return false;
      if (existingKeys.has(p.key)) return false;
      return true;
    });

    if (newProps.length === 0) {
      return NextResponse.json({ error: '추가 가능한 속성을 만들지 못했어요. 다시 시도하거나 직접 입력해주세요.' }, { status: 400 });
    }

    // 컬렉션 schema 업데이트
    const updatedSchema = [...currentSchema, ...newProps];
    await supabase
      .from('archive_collections')
      .update({ schema: updatedSchema, updated_at: new Date().toISOString() })
      .eq('id', id);

    return NextResponse.json({ added: newProps, schema: updatedSchema });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
