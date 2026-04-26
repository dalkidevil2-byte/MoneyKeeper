export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { parseNotionDatabaseId, scanNotionDatabase } from '@/lib/notion-todo';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET — 등록된 소스 목록 (토큰은 마스킹)
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  try {
    const { data, error } = await supabase
      .from('todo_notion_sources')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const masked = (data ?? []).map((s) => ({
      ...s,
      notion_token: s.notion_token ? '••••••••' : '',
    }));
    return NextResponse.json({ sources: masked });
  } catch (error) {
    console.error('[GET /todo/notion-sources]', error);
    return NextResponse.json({ error: '소스를 불러오지 못했습니다.' }, { status: 500 });
  }
}

// POST — 소스 추가 (URL → DB scan + 등록)
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const token: string | undefined = body.notion_token;
    const url: string | undefined = body.database_url;
    const name: string = body.name ?? '';
    if (!token || !url) {
      return NextResponse.json({ error: '토큰과 DB URL이 필요합니다.' }, { status: 400 });
    }
    const databaseId = parseNotionDatabaseId(url);
    if (!databaseId) {
      return NextResponse.json({ error: 'Notion DB URL을 인식하지 못했습니다.' }, { status: 400 });
    }

    // 스캔 시도 (잘못된 토큰/권한 검증)
    let scan;
    try {
      scan = await scanNotionDatabase(token, databaseId);
    } catch (e: any) {
      const msg = e?.message ?? '';
      return NextResponse.json(
        {
          error:
            'Notion DB 접근 실패: ' +
            (msg.includes('Could not find database')
              ? 'Integration이 해당 DB에 연결되어 있는지 확인해주세요.'
              : msg),
        },
        { status: 400 },
      );
    }

    const insertData = {
      household_id: body.household_id ?? DEFAULT_HOUSEHOLD_ID,
      name: name || scan.title || 'Notion DB',
      notion_token: token,
      database_id: databaseId,
      database_url: url,
      title_property: scan.candidates.title ?? '',
      date_property: scan.candidates.date ?? '',
      member_property: scan.candidates.member ?? '',
      category_property: scan.candidates.category ?? '',
      is_active: true,
    };
    const { data, error } = await supabase
      .from('todo_notion_sources')
      .insert(insertData)
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json(
      {
        source: { ...data, notion_token: '••••••••' },
        scan,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[POST /todo/notion-sources]', error);
    return NextResponse.json({ error: '소스 추가 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
