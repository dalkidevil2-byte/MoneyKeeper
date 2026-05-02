export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { Client } from '@notionhq/client';
import OpenAI from 'openai';
import { getSecret } from '@/lib/app-secrets';
import type { ArchiveProperty } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/archive/collections/[id]/import-notion
 * body: {
 *   notion_database_id: string,   // 노션 DB ID 또는 URL
 *   property_map?: Record<string, string>,  // notion prop name → archive key (선택)
 *   dry_run?: boolean,            // true 면 미리보기만 (저장 X)
 * }
 *
 * 응답: { imported, skipped, errors, preview?, suggestions? }
 */

type NotionPropValue =
  | { type: 'title'; title: Array<{ plain_text: string }> }
  | { type: 'rich_text'; rich_text: Array<{ plain_text: string }> }
  | { type: 'number'; number: number | null }
  | { type: 'select'; select: { name: string } | null }
  | { type: 'multi_select'; multi_select: Array<{ name: string }> }
  | { type: 'date'; date: { start: string; end?: string } | null }
  | { type: 'checkbox'; checkbox: boolean }
  | { type: 'url'; url: string | null }
  | { type: 'email'; email: string | null }
  | { type: 'phone_number'; phone_number: string | null }
  | { type: 'files'; files: Array<{ name: string; file?: { url: string }; external?: { url: string } }> }
  | { type: 'people'; people: Array<{ name?: string }> }
  | { type: 'created_time'; created_time: string }
  | { type: 'last_edited_time'; last_edited_time: string }
  | { type: 'formula'; formula: { type: string; string?: string; number?: number; boolean?: boolean; date?: { start: string } } }
  | { type: 'rollup'; rollup: { type: string; string?: string; number?: number; date?: { start: string } } }
  | { type: string; [key: string]: unknown };

function extractValue(prop: NotionPropValue): unknown {
  if (!prop || !prop.type) return null;
  switch (prop.type) {
    case 'title':
    case 'rich_text': {
      const arr = (prop as { title?: Array<{ plain_text: string }>; rich_text?: Array<{ plain_text: string }> });
      const list = arr.title ?? arr.rich_text ?? [];
      return list.map((t) => t.plain_text).join('').trim() || null;
    }
    case 'number':
      return (prop as { number: number | null }).number;
    case 'select': {
      const v = (prop as { select: { name: string } | null }).select;
      return v?.name ?? null;
    }
    case 'multi_select': {
      const v = (prop as { multi_select: Array<{ name: string }> }).multi_select;
      return v.map((x) => x.name);
    }
    case 'date': {
      const v = (prop as { date: { start: string } | null }).date;
      return v?.start ?? null;
    }
    case 'checkbox':
      return (prop as { checkbox: boolean }).checkbox;
    case 'url':
      return (prop as { url: string | null }).url;
    case 'email':
      return (prop as { email: string | null }).email;
    case 'phone_number':
      return (prop as { phone_number: string | null }).phone_number;
    case 'files': {
      const files = (prop as { files: Array<{ name: string; file?: { url: string }; external?: { url: string } }> }).files;
      return files
        .map((f) => {
          const url = f.file?.url ?? f.external?.url;
          if (!url) return null;
          return { url, name: f.name, type: '' };
        })
        .filter(Boolean);
    }
    case 'people': {
      const v = (prop as { people: Array<{ name?: string }> }).people;
      return v.map((p) => p.name ?? '').filter(Boolean).join(', ') || null;
    }
    case 'created_time':
      return (prop as { created_time: string }).created_time?.slice(0, 10) ?? null;
    case 'last_edited_time':
      return (prop as { last_edited_time: string }).last_edited_time?.slice(0, 10) ?? null;
    case 'formula': {
      const f = (prop as { formula: { type: string; string?: string; number?: number; boolean?: boolean; date?: { start: string } } }).formula;
      if (!f) return null;
      if (f.type === 'string') return f.string ?? null;
      if (f.type === 'number') return f.number ?? null;
      if (f.type === 'boolean') return f.boolean ?? null;
      if (f.type === 'date') return f.date?.start ?? null;
      return null;
    }
    default:
      return null;
  }
}

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[\s_\-]+/g, '');
}

// 노션 DB ID 파싱 — URL 도 허용
function parseDatabaseId(input: string): string {
  const trimmed = input.trim();
  // UUID 형태로 추출
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
    // 컬렉션의 household_id 먼저 확인 (시크릿 조회용)
    const { data: collection } = await supabase
      .from('archive_collections')
      .select('household_id')
      .eq('id', id)
      .maybeSingle();

    const notionToken = await getSecret(
      'notion_token',
      'NOTION_TOKEN',
      collection?.household_id,
    );
    if (!notionToken) {
      return NextResponse.json(
        {
          error:
            '노션 토큰이 등록되지 않았어요. 설정 → 통합(Integrations) 에서 노션 토큰을 입력해주세요.',
        },
        { status: 400 },
      );
    }
    const notion = new Client({ auth: notionToken });

    const body = await req.json();
    const dbIdInput: string = body.notion_database_id;
    const dryRun: boolean = !!body.dry_run;
    const useAi: boolean = !!body.use_ai;
    const propertyMap: Record<string, string> = body.property_map ?? {};

    if (!dbIdInput) {
      return NextResponse.json({ error: 'notion_database_id 필요' }, { status: 400 });
    }
    const dbId = parseDatabaseId(dbIdInput);

    // 컬렉션 schema (household_id 는 위에서 조회됨)
    if (!collection) return NextResponse.json({ error: '컬렉션 없음' }, { status: 404 });
    const { data: col } = await supabase
      .from('archive_collections')
      .select('schema, name')
      .eq('id', id)
      .maybeSingle();
    const schema = ((col?.schema ?? []) as ArchiveProperty[]);

    // 노션 DB 메타 (속성 목록)
    let dbMeta: { properties: Record<string, { type: string }>; title?: Array<{ plain_text: string }> };
    try {
      dbMeta = (await notion.databases.retrieve({ database_id: dbId })) as unknown as {
        properties: Record<string, { type: string }>;
        title?: Array<{ plain_text: string }>;
      };
    } catch (e) {
      return NextResponse.json(
        {
          error:
            (e instanceof Error ? e.message : '노션 DB 접근 실패') +
            ' — DB ID 가 맞는지, 노션 통합이 그 페이지에 공유돼 있는지 확인하세요.',
        },
        { status: 400 },
      );
    }

    const notionProps = Object.keys(dbMeta.properties);

    // 자동 매핑 — propertyMap 이 없으면 이름 유사도로
    const finalMap: Record<string, string> = { ...propertyMap };
    if (Object.keys(finalMap).length === 0) {
      for (const np of notionProps) {
        const npn = normalizeKey(np);
        const match = schema.find((p) => {
          if (normalizeKey(p.label) === npn) return true;
          if (normalizeKey(p.key) === npn) return true;
          // 흔한 동의어
          if (npn === 'name' && (p.key === 'title' || p.label === '제목' || p.label === '이름')) return true;
          if (npn === 'title' && (p.key === 'name' || p.label === '제목' || p.label === '이름')) return true;
          return false;
        });
        if (match) finalMap[np] = match.key;
      }
      // 매핑 안 된 노션 title 속성은 archive 첫 속성 (title) 으로 폴백
      const titleNp = notionProps.find((np) => dbMeta.properties[np].type === 'title');
      if (titleNp && !finalMap[titleNp] && schema[0]) {
        finalMap[titleNp] = schema[0].key;
      }

      // AI 매핑 — 이름이 달라도 의미로 매칭
      if (useAi && process.env.OPENAI_API_KEY) {
        try {
          const notionList = notionProps.map((np) => ({ name: np, type: dbMeta.properties[np].type }));
          const archiveList = schema.map((p) => ({ key: p.key, label: p.label, type: p.type }));
          const sysPrompt = `노션 데이터베이스의 속성을 아카이브 컬렉션의 속성에 매칭해주세요.
의미가 비슷하면 매칭 (예: 노션의 "재료/Ingredients" → 아카이브 "ingredients/재료").
타입도 호환되어야 함:
- 노션 title/rich_text → archive text/longtext
- 노션 number → number/currency/rating
- 노션 select → select 또는 text
- 노션 multi_select → multiselect 또는 text
- 노션 date → date
- 노션 checkbox → checkbox
- 노션 url → url
- 노션 files → files
응답 형식 (JSON만): {"mapping": {"노션이름": "아카이브key"}}
매칭할 게 없으면 그 노션 속성은 mapping 에서 제외.`;
          const userPrompt = `노션 속성:
${JSON.stringify(notionList, null, 2)}

아카이브 schema:
${JSON.stringify(archiveList, null, 2)}`;
          const r = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
          });
          const raw = r.choices[0]?.message?.content ?? '{}';
          const parsed = JSON.parse(raw) as { mapping?: Record<string, string> };
          if (parsed.mapping) {
            for (const [np, ak] of Object.entries(parsed.mapping)) {
              // 유효성: notion 속성 + archive key 모두 존재 시만
              if (notionProps.includes(np) && schema.some((p) => p.key === ak)) {
                finalMap[np] = ak;
              }
            }
          }
        } catch (e) {
          console.error('[notion-import AI mapping]', e);
          // AI 실패해도 자동매핑 결과는 그대로 사용
        }
      }
    }

    // 미리보기 (dry_run): 매핑 + 첫 5개 페이지만
    const householdId = collection.household_id ?? '';

    let cursor: string | undefined = undefined;
    const allPages: Array<Record<string, unknown>> = [];
    let fetchCount = 0;
    const MAX_PAGES = dryRun ? 5 : 500;

    // notion SDK 타입이 query 를 누락시켜서 unknown 캐스팅
    const notionDbs = notion.databases as unknown as {
      query: (args: { database_id: string; start_cursor?: string; page_size?: number }) => Promise<{
        results: Array<{ object: string; properties?: Record<string, NotionPropValue> }>;
        has_more: boolean;
        next_cursor?: string;
      }>;
    };

    while (fetchCount < MAX_PAGES) {
      const res = await notionDbs.query({
        database_id: dbId,
        start_cursor: cursor,
        page_size: dryRun ? 5 : 100,
      });
      for (const page of res.results) {
        if ((page as { object: string }).object !== 'page') continue;
        const props = ((page as unknown as { properties: Record<string, NotionPropValue> }).properties) ?? {};
        const data: Record<string, unknown> = {};
        for (const [npName, npVal] of Object.entries(props)) {
          const archiveKey = finalMap[npName];
          if (!archiveKey) continue;
          const targetProp = schema.find((p) => p.key === archiveKey);
          if (!targetProp) continue;

          const raw = extractValue(npVal);
          if (raw == null || raw === '') continue;

          // 타입에 맞춰 변환
          if (targetProp.type === 'longtext' || targetProp.type === 'text') {
            data[archiveKey] = String(raw);
          } else if (targetProp.type === 'number' || targetProp.type === 'currency') {
            const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.-]/g, ''));
            if (Number.isFinite(n)) data[archiveKey] = n;
          } else if (targetProp.type === 'rating') {
            const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
            if (Number.isFinite(n)) data[archiveKey] = Math.max(1, Math.min(5, n));
          } else if (targetProp.type === 'checkbox') {
            data[archiveKey] = Boolean(raw);
          } else if (targetProp.type === 'multiselect') {
            data[archiveKey] = Array.isArray(raw) ? raw : [String(raw)];
          } else if (targetProp.type === 'select') {
            data[archiveKey] = Array.isArray(raw) ? raw[0] ?? null : String(raw);
          } else if (targetProp.type === 'date') {
            data[archiveKey] = String(raw).slice(0, 10);
          } else if (targetProp.type === 'url') {
            data[archiveKey] = String(raw);
          } else if (targetProp.type === 'files') {
            // 노션 file URL 은 만료되니, 그대로 저장하면 추후 깨질 수 있음.
            // 일단 그대로 저장하되 사용자가 알게 description 에 표시.
            if (Array.isArray(raw)) data[archiveKey] = raw;
          } else if (targetProp.type === 'checklist') {
            // longtext 같은 다중 라인 → 줄별 항목
            const txt = String(raw);
            const lines = txt
              .split(/\n|,/)
              .map((s) => s.trim())
              .filter(Boolean);
            if (lines.length > 0) {
              data[archiveKey] = lines.map((label) => ({ label, done: false }));
            }
          } else {
            data[archiveKey] = String(raw);
          }
        }
        allPages.push(data);
        fetchCount += 1;
        if (fetchCount >= MAX_PAGES) break;
      }
      if (!res.has_more || !res.next_cursor) break;
      cursor = res.next_cursor;
    }

    if (dryRun) {
      // 매핑 정보 + 첫 5개 미리보기
      const suggestions = notionProps.map((np) => ({
        notion: np,
        notion_type: dbMeta.properties[np].type,
        archive_key: finalMap[np] ?? null,
        archive_label:
          finalMap[np] != null
            ? schema.find((p) => p.key === finalMap[np])?.label ?? null
            : null,
      }));
      return NextResponse.json({
        dry_run: true,
        suggestions,
        preview: allPages,
        total_fetched: fetchCount,
      });
    }

    // 실제 저장 — 일괄 insert
    const inserts = allPages
      .filter((d) => Object.keys(d).length > 0)
      .map((data) => ({
        collection_id: id,
        household_id: householdId,
        data,
      }));

    if (inserts.length === 0) {
      return NextResponse.json({ imported: 0, skipped: fetchCount, errors: [] });
    }

    const { error: insErr } = await supabase.from('archive_entries').insert(inserts);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({
      imported: inserts.length,
      skipped: fetchCount - inserts.length,
      errors: [],
    });
  } catch (e) {
    console.error('[archive/import-notion]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
