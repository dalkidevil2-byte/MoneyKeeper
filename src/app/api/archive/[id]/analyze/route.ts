export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { logAiUsage } from '@/lib/ai-usage';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';

/**
 * POST /api/archive/[id]/analyze
 *
 * 컬렉션의 schema + 모든 entries 를 GPT 한테 던져서
 * 어떤 분석이 의미있는지 AI 가 알아서 판단 후 인사이트 리턴.
 *
 * 응답: { ok: true, summary: string, insights: string[], stats?: object }
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();

  try {
    const { data: collection, error: cErr } = await supabase
      .from('archive_collections')
      .select('id, name, emoji, description, schema, household_id')
      .eq('id', id)
      .single();
    if (cErr || !collection) {
      return NextResponse.json(
        { ok: false, error: '컬렉션을 찾을 수 없습니다.' },
        { status: 404 },
      );
    }

    const { data: entries } = await supabase
      .from('archive_entries')
      .select('data, created_at, updated_at')
      .eq('collection_id', id)
      .order('updated_at', { ascending: false })
      .limit(500); // 너무 많으면 토큰 폭발

    if (!entries || entries.length === 0) {
      return NextResponse.json({
        ok: true,
        summary: '아직 항목이 없어 분석할 수 없어요.',
        insights: [],
      });
    }

    // 데이터 슬라이스 — 너무 많으면 최근 200건만
    const sample = entries.slice(0, 200);

    const prompt = `당신은 데이터 분석가입니다. 사용자가 만든 사용자 정의 컬렉션을 보고
의미 있는 인사이트를 찾아내세요.

[컬렉션 정보]
- 이름: ${collection.name}
- 설명: ${collection.description ?? '(없음)'}
- 항목 수: ${entries.length}개${entries.length > sample.length ? ` (분석 샘플: 최근 ${sample.length}건)` : ''}
- 스키마(컬럼 정의):
${JSON.stringify(collection.schema, null, 2)}

[항목 데이터 (created_at desc)]
${JSON.stringify(
  sample.map((e) => ({
    ...((e.data as Record<string, unknown>) ?? {}),
    _created: e.created_at,
  })),
  null,
  0,
)}

[지시사항]
- 컬렉션 주제와 데이터를 보고 "어떤 분석이 사용자에게 흥미로울지" 직접 판단.
- 예시 (다 할 필요 없음, 데이터에 맞는 것만):
  - 카테고리/장르/태그별 분포 (가장 많은/적은)
  - 평점/숫자/통화 컬럼의 평균/최대/최소/추세
  - 시간 흐름 (최근 1개월 vs 그 전, 월별 추가 빈도)
  - 미완료/체크박스 비율
  - 흥미로운 패턴/이상치 (예: 평점 5점만 줬다 → 후한 평가자, 특정 장르 편중)
  - 추천 (예: "최근 등록 안 한 지 N일, 새 항목 추가 시점")
- 한국어로 답변. 친근하고 짧게.
- 응답은 JSON 형식 (다른 텍스트 없이):

{
  "summary": "1~2문장 핵심 요약",
  "insights": [
    "💡 구체적 인사이트 1 (이모지로 시작, 한 줄)",
    "📊 인사이트 2"
  ],
  "charts": [
    // 각 차트 타입에서 데이터에 맞는 것만 골라서 1~4개 생성
    // type 별 schema:
    // 1) "bar"    — 카테고리/멤버/태그/장르별 카운트. 데이터: { labels: ["코미디","액션"], values: [5,3] }
    // 2) "pie"    — 비율 (3~7개 카테고리). 데이터: { labels: [...], values: [...] }
    // 3) "line"   — 시간 흐름 (월별 추가 수, 평점 추세). 데이터: { points: [{x:"2026-01", y:3},{x:"2026-02", y:5}] }
    // 4) "waffle" — 100개 셀로 비율 표시. 데이터: { categories: [{label:"완료", count:7, color:"#10b981"},{label:"진행중", count:3, color:"#f59e0b"}] }
    //              count 합이 보통 10 (10x10 = 100셀, 셀당 10%)
    // 5) "stat"   — 큰 숫자 한 개. 데이터: { value: 4.2, label: "평균 평점", sublabel: "5점 만점" }
    {
      "type": "bar" | "pie" | "line" | "waffle" | "stat",
      "title": "장르별 분포",
      "data": { /* 위 schema 참고 */ }
    }
  ]
}

insights 는 3~5개. charts 는 데이터에 맞는 것만 1~4개. 데이터에서 실제로 발견한 사실만.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '당신은 데이터에서 흥미로운 패턴을 발견하는 분석가입니다. 컬렉션 데이터를 보고 의미 있는 인사이트를 JSON 형식으로 답변하세요.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const usage = completion.usage;
    const content = completion.choices[0]?.message?.content ?? '{}';

    // 비용 로깅
    void logAiUsage({
      model: MODEL,
      feature: 'archive_ai',
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      householdId: collection.household_id as string,
      meta: { action: 'analyze', collection_id: id, entry_count: entries.length },
    });

    let parsed: {
      summary?: string;
      insights?: string[];
      charts?: Array<{ type: string; title: string; data: unknown }>;
    } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { summary: content, insights: [], charts: [] };
    }

    return NextResponse.json({
      ok: true,
      summary: parsed.summary ?? '',
      insights: parsed.insights ?? [],
      charts: parsed.charts ?? [],
      entry_count: entries.length,
    });
  } catch (e) {
    console.error('[archive/analyze]', e);
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : '분석 실패',
      },
      { status: 500 },
    );
  }
}
