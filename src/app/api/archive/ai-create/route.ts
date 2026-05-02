export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';
import type { ArchiveProperty } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

const ALLOWED_TYPES = [
  'text', 'longtext', 'number', 'currency',
  'date', 'url', 'select', 'multiselect',
  'rating', 'checkbox', 'files',
] as const;

/**
 * POST /api/archive/ai-create
 * body: { intent: '와인 노트 컬렉션 만들고 싶어' }
 * → LLM 이 이름/이모지/색/속성 자동 생성 → DB insert → 컬렉션 반환
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const intent: string = body.intent;
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    if (!intent || !intent.trim()) {
      return NextResponse.json({ error: 'intent 필요' }, { status: 400 });
    }

    const systemPrompt = `당신은 노션 같은 데이터베이스 컬렉션 디자이너입니다.
사용자가 "X 컬렉션 만들고 싶어" 라고 자연어로 적으면, JSON으로 컬렉션 정의를 응답합니다.

응답 형식:
{
  "name": "컬렉션 이름 (한글 권장)",
  "emoji": "이모지 1개",
  "color": "hex 색상 (예: #6366f1) — 주제에 어울리는 색",
  "description": "한 줄 설명 (선택)",
  "schema": [
    { "key": "title", "label": "제목", "type": "text", "required": true },
    ...
  ]
}

지원 타입: ${ALLOWED_TYPES.join(', ')}
- 첫 속성은 보통 제목/이름 역할 (text, required: true)
- 일반적으로 3~7개 속성
- 날짜는 'date', 금액은 'currency' (원), 등급은 'rating' (1~5)
- 분류는 'select' + options (3~6개)
- 여러 태그는 'multiselect' + options
- 긴 메모는 'longtext'

규칙:
- key 는 영문 snake_case (예: title, watch_date, watched_with)
- label 은 한글
- 응답은 JSON 만, 설명 없이`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: intent.trim() },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    let parsed: {
      name?: string;
      emoji?: string;
      color?: string;
      description?: string;
      schema?: ArchiveProperty[];
    };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    if (!parsed.name || !parsed.schema || parsed.schema.length === 0) {
      return NextResponse.json(
        { error: '컬렉션을 만들지 못했어요. 좀 더 자세히 적어주세요.' },
        { status: 400 },
      );
    }

    // schema 유효성 체크
    const validSchema = parsed.schema.filter(
      (p) =>
        p?.key &&
        p?.label &&
        p?.type &&
        (ALLOWED_TYPES as readonly string[]).includes(p.type),
    );
    if (validSchema.length === 0) {
      return NextResponse.json({ error: '속성 추론 실패' }, { status: 500 });
    }

    const insert = {
      household_id: householdId,
      name: parsed.name.trim(),
      emoji: parsed.emoji ?? '📦',
      color: parsed.color ?? '#6366f1',
      description: parsed.description ?? '',
      schema: validSchema,
      is_active: true,
    };
    const { data, error } = await supabase
      .from('archive_collections')
      .insert(insert)
      .select('*')
      .single();
    if (error) throw error;

    return NextResponse.json({ collection: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
