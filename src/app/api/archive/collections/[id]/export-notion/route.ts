export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { Client } from '@notionhq/client';
import { getSecret } from '@/lib/app-secrets';
import type { ArchiveProperty } from '@/types';

/**
 * POST /api/archive/collections/[id]/export-notion
 * body: {
 *   notion_database_id?: string,   // 기존 DB 로 export
 *   parent_page_id?: string,       // 새 DB 만들기 — 부모 페이지 ID
 *   dry_run?: boolean,
 * }
 *
 * 응답: { exported, errors, database_id, database_url }
 */

const archiveTypeToNotion: Record<string, string> = {
  text: 'rich_text',
  longtext: 'rich_text',
  number: 'number',
  currency: 'number',
  date: 'date',
  url: 'url',
  select: 'select',
  multiselect: 'multi_select',
  rating: 'number',
  checkbox: 'checkbox',
  files: 'files',
  checklist: 'rich_text', // 노션엔 체크리스트 속성 없음 → rich_text 로 평탄화
  member: 'rich_text',
};

function archivePropToNotionPropSchema(p: ArchiveProperty, isFirst: boolean): Record<string, unknown> | null {
  // 노션은 첫 속성을 title 로 강제
  if (isFirst) {
    return { title: {} };
  }
  const ntype = archiveTypeToNotion[p.type];
  if (!ntype) return null;
  if (ntype === 'select' && p.options) {
    return { select: { options: p.options.map((name) => ({ name })) } };
  }
  if (ntype === 'multi_select' && p.options) {
    return { multi_select: { options: p.options.map((name) => ({ name })) } };
  }
  return { [ntype]: {} };
}

function buildNotionPropertyValue(
  p: ArchiveProperty,
  value: unknown,
  isFirst: boolean,
): Record<string, unknown> | null {
  if (isFirst) {
    // title — 무엇이든 string 으로 변환
    const text = String(value ?? '').slice(0, 2000) || '(제목 없음)';
    return { title: [{ text: { content: text } }] };
  }
  if (value == null || value === '') return null;
  switch (p.type) {
    case 'text':
    case 'longtext':
    case 'member': {
      const text = String(value).slice(0, 2000);
      return { rich_text: [{ text: { content: text } }] };
    }
    case 'number':
    case 'currency':
    case 'rating': {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      if (!Number.isFinite(n)) return null;
      return { number: n };
    }
    case 'date': {
      const s = String(value);
      if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
      return { date: { start: s.slice(0, 10) } };
    }
    case 'url':
      return { url: String(value) };
    case 'select': {
      const name = String(value);
      if (!name) return null;
      return { select: { name } };
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value.map(String) : [String(value)];
      return { multi_select: arr.filter(Boolean).map((name) => ({ name })) };
    }
    case 'checkbox':
      return { checkbox: !!value };
    case 'files': {
      const arr = Array.isArray(value)
        ? (value as Array<{ url?: string; name?: string }>)
        : [];
      const files = arr
        .filter((f) => f.url)
        .map((f) => ({
          name: (f.name ?? 'file').slice(0, 100),
          external: { url: f.url as string },
        }));
      if (files.length === 0) return null;
      return { files };
    }
    case 'checklist': {
      // 평탄화: "[X] 항목1\n[ ] 항목2\n..."
      const arr = Array.isArray(value)
        ? (value as Array<{ label: string; done: boolean }>)
        : [];
      if (arr.length === 0) return null;
      const text = arr
        .map((it) => `${it.done ? '[x]' : '[ ]'} ${it.label}`)
        .join('\n')
        .slice(0, 2000);
      return { rich_text: [{ text: { content: text } }] };
    }
    default:
      return null;
  }
}

function parseId(input: string): string {
  const trimmed = input.trim();
  const m = trimmed.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/);
  if (m) return m[0].replace(/-/g, '').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
  return trimmed;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  try {
    // 컬렉션 조회
    const { data: collection } = await supabase
      .from('archive_collections')
      .select('household_id, name, emoji, schema')
      .eq('id', id)
      .maybeSingle();
    if (!collection) {
      return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    }
    const schema = (collection.schema ?? []) as ArchiveProperty[];

    const notionToken = await getSecret(
      'notion_token',
      'NOTION_TOKEN',
      collection.household_id,
    );
    if (!notionToken) {
      return NextResponse.json(
        { error: '노션 토큰이 등록되지 않았어요. 먼저 토큰부터 등록하세요.' },
        { status: 400 },
      );
    }
    const notion = new Client({ auth: notionToken });

    const body = await req.json();
    const dryRun: boolean = !!body.dry_run;
    const targetDbId: string | undefined = body.notion_database_id
      ? parseId(body.notion_database_id)
      : undefined;
    const parentPageId: string | undefined = body.parent_page_id
      ? parseId(body.parent_page_id)
      : undefined;

    if (!targetDbId && !parentPageId) {
      return NextResponse.json(
        {
          error:
            'notion_database_id (기존 DB) 또는 parent_page_id (새 DB 만들 부모 페이지) 중 하나가 필요해요.',
        },
        { status: 400 },
      );
    }

    // 항목 조회
    const { data: entries } = await supabase
      .from('archive_entries')
      .select('id, data, position, created_at')
      .eq('collection_id', id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: false });
    const entryList = (entries ?? []) as Array<{
      id: string;
      data: Record<string, unknown>;
    }>;

    if (entryList.length === 0) {
      return NextResponse.json({ exported: 0, errors: ['항목이 없어요.'] });
    }

    if (dryRun) {
      return NextResponse.json({
        dry_run: true,
        total: entryList.length,
        target: targetDbId ? `기존 DB ${targetDbId}` : `새 DB (in ${parentPageId})`,
      });
    }

    // 1) 새 DB 생성 (parent_page_id 만 있는 경우)
    let dbId = targetDbId;
    let dbUrl: string | undefined;
    if (!dbId && parentPageId) {
      const properties: Record<string, unknown> = {};
      schema.forEach((p, i) => {
        const np = archivePropToNotionPropSchema(p, i === 0);
        if (!np) return;
        // 노션 속성 이름 = label
        properties[p.label] = np;
      });
      try {
        const dbsApi = notion.databases as unknown as {
          create: (args: unknown) => Promise<{ id: string; url?: string }>;
        };
        const created = await dbsApi.create({
          parent: { type: 'page_id', page_id: parentPageId },
          icon: collection.emoji
            ? { type: 'emoji', emoji: collection.emoji }
            : undefined,
          title: [{ type: 'text', text: { content: collection.name } }],
          properties,
        });
        dbId = created.id;
        dbUrl = created.url;
      } catch (e) {
        return NextResponse.json(
          {
            error:
              (e instanceof Error ? e.message : '노션 DB 생성 실패') +
              ' — parent page 가 존재하고 통합에 공유돼 있는지 확인하세요.',
          },
          { status: 400 },
        );
      }
    }

    if (!dbId) {
      return NextResponse.json({ error: 'DB ID 결정 실패' }, { status: 500 });
    }

    // 2) 각 entry → 노션 페이지 생성
    const errors: string[] = [];
    let exported = 0;

    for (const entry of entryList) {
      const data = (entry.data ?? {}) as Record<string, unknown>;
      const properties: Record<string, unknown> = {};
      schema.forEach((p, i) => {
        const v = buildNotionPropertyValue(p, data[p.key], i === 0);
        if (v) properties[p.label] = v;
      });
      // title 이 없으면 (스키마 첫 속성이 비어있는 경우) 기본 채움
      if (schema[0] && !properties[schema[0].label]) {
        properties[schema[0].label] = {
          title: [{ text: { content: '(제목 없음)' } }],
        };
      }
      try {
        const pagesApi = notion.pages as unknown as {
          create: (args: unknown) => Promise<unknown>;
        };
        await pagesApi.create({
          parent: { database_id: dbId },
          properties,
        });
        exported += 1;
      } catch (e) {
        errors.push(
          `${entry.id.slice(0, 8)}: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }

    return NextResponse.json({
      exported,
      total: entryList.length,
      errors: errors.slice(0, 10), // 너무 길면 자르기
      database_id: dbId,
      database_url: dbUrl,
    });
  } catch (e) {
    console.error('[archive/export-notion]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
