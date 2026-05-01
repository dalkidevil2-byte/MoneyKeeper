export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';
import type { ArchiveProperty } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ALLOWED_TYPES = [
  'text', 'longtext', 'number', 'currency',
  'date', 'url', 'select', 'multiselect',
  'rating', 'checkbox',
] as const;

/**
 * POST /api/archive/collections/[id]/ai-schema
 * body: {
 *   intent: '날짜 속성 삭제하고 리뷰는 긴 텍스트로 바꿔줘',
 *   currentSchema?: ArchiveProperty[]   // 수정 중인 로컬 상태 (없으면 DB)
 * }
 * → LLM 이 전체 schema 를 재구성해서 반환 (DB 저장은 클라이언트에서 별도)
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

    let currentSchema: ArchiveProperty[] = body.currentSchema;
    let collectionMeta: { name: string; description: string } = {
      name: '',
      description: '',
    };

    const { data: col } = await supabase
      .from('archive_collections')
      .select('name, description, schema')
      .eq('id', id)
      .maybeSingle();
    if (!col) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    collectionMeta = { name: col.name, description: col.description ?? '' };
    if (!currentSchema) currentSchema = (col.schema ?? []) as ArchiveProperty[];

    const systemPrompt = `당신은 노션 같은 데이터베이스의 스키마 편집 도우미입니다.
사용자가 자연어로 명령하면, 현재 schema 를 받아 **전체 새 schema** 를 JSON 으로 응답합니다.

지원 타입: ${ALLOWED_TYPES.join(', ')}

가능한 명령 종류:
- 추가: "사진 속성 추가", "별점 추가해줘"
- 삭제: "memo 속성 빼줘", "날짜 삭제"
- 이름 수정: "watch_date 라벨을 시청일로 변경"
- 타입 변경: "리뷰는 긴 텍스트로 바꿔줘"
- 옵션 변경: "장르 옵션에 다큐 추가"
- 순서 변경: "별점을 첫번째로 옮겨줘", "제목 다음에 날짜"
- required 변경: "제목은 필수로"

규칙:
- key 는 영문 snake_case. **기존 속성의 key 는 절대 바꾸지 말 것** (데이터 손실 방지). 새로 추가하는 속성만 새 key 부여
- 사용자가 명시적으로 삭제 요청한 항목만 제거. 그 외는 그대로 유지
- label 은 한글
- options 는 select/multiselect 일 때만
- 응답 형식: {"schema":[{key,label,type,options?,required?}], "summary":"한 줄로 무엇을 했는지"}
- summary 는 한국어, 예: "memo 삭제하고 사진(url) 추가했어요"
- 응답은 JSON 만, 다른 설명 X`;

    const userPrompt = `컬렉션: "${collectionMeta.name}"${collectionMeta.description ? ` (${collectionMeta.description})` : ''}

현재 스키마:
${JSON.stringify(currentSchema, null, 2)}

명령: ${intent.trim()}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    let parsed: { schema?: ArchiveProperty[]; summary?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    const newSchema = (parsed.schema ?? []).filter(
      (p) =>
        p?.key &&
        p?.label &&
        p?.type &&
        (ALLOWED_TYPES as readonly string[]).includes(p.type),
    );

    if (newSchema.length === 0) {
      return NextResponse.json(
        { error: 'AI 가 유효한 스키마를 만들지 못했어요. 명령을 더 명확히 해주세요.' },
        { status: 400 },
      );
    }

    // 변경 요약 (LLM 이 안 줬으면 직접 계산)
    const oldKeys = new Set(currentSchema.map((p) => p.key));
    const newKeys = new Set(newSchema.map((p) => p.key));
    const added = newSchema.filter((p) => !oldKeys.has(p.key));
    const removed = currentSchema.filter((p) => !newKeys.has(p.key));

    const fallbackSummary =
      [
        added.length > 0 && `${added.map((p) => p.label).join(', ')} 추가`,
        removed.length > 0 && `${removed.map((p) => p.label).join(', ')} 삭제`,
      ]
        .filter(Boolean)
        .join(' · ') || '스키마 업데이트';
    const summary = parsed.summary ?? fallbackSummary;

    return NextResponse.json({
      schema: newSchema,
      summary,
      added: added.length,
      removed: removed.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
