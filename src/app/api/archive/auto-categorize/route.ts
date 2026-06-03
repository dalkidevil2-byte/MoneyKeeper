export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import OpenAI from 'openai';
import { logAiUsage } from '@/lib/ai-usage';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

const PALETTE = [
  '#6366f1', '#ec4899', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6',
];

type Col = {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  parent_id: string | null;
};

/**
 * POST /api/archive/auto-categorize
 * 기존 컬렉션들을 LLM 으로 성격별 카테고리로 분류한다.
 * - 카테고리 = 자식을 가진(또는 새로 만든) 컬렉션 (parent_id=null, 빈 schema)
 * - 미분류(자식 없고 parent 없는) 컬렉션을 적절한 카테고리 하위로 이동.
 * - 이미 분류된 컬렉션/카테고리는 건드리지 않음 (재실행 시 기존 카테고리 재사용).
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json().catch(() => ({}));
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;

    const { data: rows, error } = await supabase
      .from('archive_collections')
      .select('id, name, emoji, description, parent_id')
      .eq('household_id', householdId)
      .eq('is_active', true);
    if (error) throw error;

    const all = (rows ?? []) as Col[];
    if (all.length === 0) {
      return NextResponse.json({ created: 0, moved: 0, message: '컬렉션이 없어요.' });
    }

    // 자식을 가진 컬렉션 = 카테고리
    const childCount = new Map<string, number>();
    for (const c of all) {
      if (c.parent_id) childCount.set(c.parent_id, (childCount.get(c.parent_id) ?? 0) + 1);
    }
    const existingCategories = all.filter((c) => (childCount.get(c.id) ?? 0) > 0);
    const categoryIds = new Set(existingCategories.map((c) => c.id));

    // 미분류 = parent 없음 + 카테고리 아님
    const uncategorized = all.filter((c) => !c.parent_id && !categoryIds.has(c.id));

    if (uncategorized.length === 0) {
      return NextResponse.json({
        created: 0,
        moved: 0,
        message: '이미 모두 분류되어 있어요.',
      });
    }

    const systemPrompt = `당신은 개인 아카이브의 컬렉션들을 "성격별 카테고리"로 묶어 정리하는 도우미입니다.

입력으로 (1) 이미 존재하는 카테고리 목록과 (2) 아직 분류되지 않은 컬렉션 목록이 주어집니다.
아직 분류되지 않은 컬렉션들을 의미가 통하는 상위 카테고리로 묶으세요.

규칙:
- 카테고리 수는 보통 4~7개. 너무 잘게 쪼개지 말 것.
- 가능하면 "이미 존재하는 카테고리"를 재사용(existing_id 사용). 적절한 게 없으면 새로 만든다.
- 모든 미분류 컬렉션을 정확히 하나의 카테고리에 배정한다(빠뜨리지 말 것).
- 카테고리 이름은 한글, 간결하게(예: "건강·운동", "취미·여가", "생활·살림", "공부·자기계발", "기록·일상", "재테크").
- 각 카테고리에 어울리는 이모지 1개.
- member_ids 에는 주어진 컬렉션 id 만 사용(새 id 지어내지 말 것).

응답은 JSON 만:
{
  "categories": [
    { "existing_id": null, "name": "건강·운동", "emoji": "💪", "member_ids": ["id1","id2"] },
    { "existing_id": "기존카테고리id", "name": "취미·여가", "emoji": "🎈", "member_ids": ["id3"] }
  ]
}`;

    const userPayload = {
      existing_categories: existingCategories.map((c) => ({
        id: c.id,
        name: c.name,
      })),
      uncategorized: uncategorized.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? '',
      })),
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    void logAiUsage({
      model: 'gpt-4o-mini',
      feature: 'archive_ai',
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      meta: { op: 'auto_categorize' },
    });

    let parsed: {
      categories?: Array<{
        existing_id?: string | null;
        name?: string;
        emoji?: string;
        member_ids?: string[];
      }>;
    };
    try {
      parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    const cats = parsed.categories ?? [];
    const uncatIds = new Set(uncategorized.map((c) => c.id));

    let created = 0;
    let moved = 0;
    let colorIdx = 0;

    for (const cat of cats) {
      const members = (cat.member_ids ?? []).filter((id) => uncatIds.has(id));
      if (members.length === 0) continue;

      // 카테고리 id 결정 — 기존 재사용 or 새로 생성
      let categoryId: string | null = null;
      if (cat.existing_id && categoryIds.has(cat.existing_id)) {
        categoryId = cat.existing_id;
      } else {
        const { data: newCat, error: insErr } = await supabase
          .from('archive_collections')
          .insert({
            household_id: householdId,
            name: (cat.name ?? '분류').trim(),
            emoji: cat.emoji ?? '📁',
            color: PALETTE[colorIdx % PALETTE.length],
            description: '카테고리',
            schema: [],
            is_active: true,
          })
          .select('id')
          .single();
        colorIdx++;
        if (insErr || !newCat) continue;
        categoryId = newCat.id as string;
        created++;
      }

      // 멤버들의 parent_id 설정
      const { error: updErr } = await supabase
        .from('archive_collections')
        .update({ parent_id: categoryId })
        .in('id', members);
      if (!updErr) moved += members.length;
    }

    return NextResponse.json({
      created,
      moved,
      message: `카테고리 ${created}개 생성 · 컬렉션 ${moved}개 정리 완료`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
