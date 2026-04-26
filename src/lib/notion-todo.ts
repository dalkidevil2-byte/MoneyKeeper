import { Client } from '@notionhq/client';
import dayjs from 'dayjs';

// Notion REST API 직접 호출 (SDK 의 .request 가 v5 에서 path 일부를 거부함)
const NOTION_VERSION = '2022-06-28';
async function notionRest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<any> {
  const url = `https://api.notion.com/v1/${path.replace(/^\//, '')}`;
  const res = await fetch(url, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json;
}

// ─────────────────────────────────────────
// TODO 모듈용 Notion 가져오기 헬퍼
// 가계부와 별개의 토큰을 사용 — todo_notion_sources 의 토큰 사용
// ─────────────────────────────────────────

export interface NotionPropertyMeta {
  name: string;
  type: string;
}

export interface NotionDatabaseScan {
  database_id: string;
  title: string;
  properties: NotionPropertyMeta[];
  candidates: {
    title: string | null;
    date: string | null;
    member: string | null;
    category: string | null;
  };
}

/** Notion URL 또는 raw ID 에서 database_id 추출 */
export function parseNotionDatabaseId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 32자리 hex (대시 유무 모두) 마지막 매치
  const match = trimmed.match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[0-9a-f]{32}/i);
  if (!match) return null;
  const id = match[0].replace(/-/g, '');
  // 표준 UUID 포맷 복원
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
}

/** DB 스캔: 속성 목록 + 후보 자동 추정 */
export async function scanNotionDatabase(
  token: string,
  databaseId: string,
): Promise<NotionDatabaseScan> {
  const client = new Client({ auth: token });
  const db: any = await client.databases.retrieve({ database_id: databaseId });
  const title =
    Array.isArray(db.title) && db.title.length > 0
      ? db.title.map((t: any) => t.plain_text ?? '').join('')
      : '';

  // properties 위치는 API 버전에 따라 다름
  // - 구버전: db.properties
  // - 2025-09-03+ : db.data_sources[0] 의 data source 를 별도 retrieve 해야 함
  let propsObj: Record<string, any> | null = db.properties ?? null;
  if (!propsObj || Object.keys(propsObj).length === 0) {
    const dataSourceId = db.data_sources?.[0]?.id;
    if (dataSourceId) {
      try {
        const ds = await notionRest(token, `data_sources/${dataSourceId}`);
        propsObj = ds.properties ?? null;
      } catch {
        // 권한 부족 시 — query 로 첫 row 의 속성 키만 회수
        const sample = await notionRest(token, `databases/${databaseId}/query`, {
          method: 'POST',
          body: { page_size: 1 },
        });
        const first = sample?.results?.[0]?.properties;
        if (first) {
          propsObj = Object.fromEntries(
            Object.entries(first).map(([k, v]: [string, any]) => [k, { type: v?.type ?? '' }]),
          );
        }
      }
    }
  }
  if (!propsObj) propsObj = {};

  const props: NotionPropertyMeta[] = Object.entries(propsObj).map(
    ([name, p]: [string, any]) => ({ name, type: (p?.type ?? '') as string }),
  );

  const findFirst = (predicate: (p: NotionPropertyMeta) => boolean) =>
    props.find(predicate)?.name ?? null;

  const candidates = {
    title: findFirst((p) => p.type === 'title'),
    date: findFirst((p) => p.type === 'date'),
    member: findFirst((p) => p.type === 'people'),
    category: findFirst((p) => p.type === 'select' || p.type === 'multi_select'),
  };

  return { database_id: databaseId, title, properties: props, candidates };
}

export interface ImportedTaskRow {
  external_id: string;
  title: string;
  due_date: string | null;
  end_date: string | null;
  due_time: string | null;
  end_time: string | null;
  is_fixed: boolean;
  category_main: string;
  category_sub: string;
  /** 노션 People 속성에서 추출한 사람 이름 배열 (예: ["김주희", "Sungjin Kim"]) */
  people_names: string[];
  /** 노션 페이지의 last_edited_time (ISO) — 변경 감지용 */
  last_edited_time: string | null;
}

/**
 * 명시적 별칭 매핑 — 자동 매칭이 실패하는 영문 표기 등을 여기에 등록.
 * 키: 노션 표기 (소문자, 공백 제거 기준), 값: 앱 멤버 이름.
 */
const NOTION_NAME_ALIASES: Record<string, string> = {
  '김주희': '주희',
  '주희': '주희',
  '김성진': '성진',
  '성진': '성진',
  'sungjinkim': '성진',
  'sungjin': '성진',
  'kimsungjin': '성진',
};

/**
 * 노션 사람 이름 → 앱 members 의 id 매칭.
 * 1) NOTION_NAME_ALIASES 우선 매핑
 * 2) 정확히 일치 (대소문자/공백 무시)
 * 3) 한국어: 끝 두/세 글자 부분 일치 (김주희 ↔ 주희)
 * 4) 영어: 토큰 단위 부분 일치
 */
export function matchMember<T extends { id: string; name: string }>(
  notionName: string,
  members: T[],
): T | null {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  const target = norm(notionName);
  if (!target) return null;

  // 1) 별칭 테이블
  const aliasTarget = NOTION_NAME_ALIASES[target];
  if (aliasTarget) {
    const hit = members.find((m) => norm(m.name) === norm(aliasTarget));
    if (hit) return hit;
  }

  // 2) 정확히 일치
  for (const m of members) {
    if (norm(m.name) === target) return m;
  }
  // 3) 한국어 부분 일치
  for (const m of members) {
    const mNorm = norm(m.name);
    if (mNorm.length >= 2 && (target.endsWith(mNorm) || target.startsWith(mNorm))) return m;
  }
  // 4) 영어 토큰 부분 일치
  const tokens = notionName.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  for (const m of members) {
    const mLower = m.name.toLowerCase();
    for (const tk of tokens) {
      if (tk.length >= 2 && (mLower.includes(tk) || tk.includes(mLower))) return m;
    }
  }
  return null;
}

/** DB 의 모든 페이지를 task 형태로 변환해서 가져옴 (페이징) */
export async function importNotionDatabase(
  token: string,
  databaseId: string,
  mapping: {
    title_property?: string;
    date_property?: string;
    category_property?: string;
    member_property?: string;
    filter_property?: string;
  },
): Promise<ImportedTaskRow[]> {
  const titleProp = mapping.title_property;
  const dateProp = mapping.date_property;
  const catProp = mapping.category_property;
  const memberProp = mapping.member_property;
  const filterProp = mapping.filter_property;

  const queryDatabase = async (start_cursor?: string): Promise<any> => {
    const body: Record<string, unknown> = { page_size: 100 };
    if (start_cursor) body.start_cursor = start_cursor;
    return notionRest(token, `databases/${databaseId}/query`, {
      method: 'POST',
      body,
    });
  };

  const results: ImportedTaskRow[] = [];
  let cursor: string | undefined = undefined;
  for (let safety = 0; safety < 50; safety++) {
    const resp: any = await queryDatabase(cursor);
    for (const page of resp.results as any[]) {
      const props = page.properties as Record<string, any>;

      // 체크박스 필터 — 지정된 속성이 false 면 skip
      if (filterProp) {
        const f = props[filterProp];
        if (!f || f.type !== 'checkbox' || f.checkbox !== true) continue;
      }

      // 제목 추출 (지정 없으면 첫 title 타입)
      let title = '';
      if (titleProp && props[titleProp]?.title) {
        title = (props[titleProp].title as any[]).map((t) => t.plain_text ?? '').join('');
      } else {
        for (const v of Object.values(props)) {
          if ((v as any).type === 'title') {
            title = ((v as any).title as any[]).map((t) => t.plain_text ?? '').join('');
            break;
          }
        }
      }
      if (!title.trim()) continue;

      // 날짜 추출
      let due_date: string | null = null;
      let end_date: string | null = null;
      let due_time: string | null = null;
      let end_time: string | null = null;
      let is_fixed = false;
      const dateField =
        (dateProp ? props[dateProp] : null) ??
        Object.values(props).find((v: any) => v?.type === 'date');
      const dateValue = (dateField as any)?.date;
      if (dateValue?.start) {
        const startStr: string = dateValue.start;
        const hasTime = startStr.length > 10;
        if (hasTime) {
          const d = dayjs(startStr);
          due_date = d.format('YYYY-MM-DD');
          due_time = d.format('HH:mm:ss');
          is_fixed = true;
        } else {
          due_date = startStr.slice(0, 10);
        }
        if (dateValue.end) {
          const endStr: string = dateValue.end;
          const endHasTime = endStr.length > 10;
          if (endHasTime) {
            const d = dayjs(endStr);
            end_date = d.format('YYYY-MM-DD');
            end_time = d.format('HH:mm:ss');
            is_fixed = true;
          } else {
            end_date = endStr.slice(0, 10);
          }
        }
      }
      if (!due_date) {
        // 날짜가 없을 때:
        //   - 체크박스 필터가 켜져있으면 (= 명시적으로 가져오겠다고 표시한 행) 오늘 날짜로 fallback
        //   - 그 외엔 skip (잘못 들어가는 거 방지)
        if (filterProp) {
          due_date = dayjs().format('YYYY-MM-DD');
        } else {
          continue;
        }
      }

      // 카테고리
      let category_main = '';
      const catField = catProp ? props[catProp] : null;
      if (catField?.type === 'select') {
        category_main = catField.select?.name ?? '';
      } else if (catField?.type === 'multi_select') {
        category_main = (catField.multi_select?.[0]?.name as string) ?? '';
      }

      // People 추출 (지정 속성 우선, 없으면 첫 People 속성, 그것도 없으면 created_by)
      const peopleNames: string[] = [];
      const peopleField = (memberProp ? props[memberProp] : null) as any;
      const peopleVal =
        peopleField?.type === 'people'
          ? peopleField.people
          : Object.values(props).find((v: any) => v?.type === 'people')?.people;
      if (Array.isArray(peopleVal)) {
        for (const p of peopleVal) {
          if (p?.name) peopleNames.push(p.name as string);
        }
      }
      // fallback: created_by
      if (peopleNames.length === 0 && page.created_by?.name) {
        peopleNames.push(page.created_by.name as string);
      }

      results.push({
        external_id: page.id as string,
        title: title.trim(),
        due_date,
        end_date,
        due_time,
        end_time,
        is_fixed,
        category_main,
        category_sub: '',
        people_names: peopleNames,
        last_edited_time: (page.last_edited_time as string | undefined) ?? null,
      });
    }
    if (!resp.has_more) break;
    cursor = resp.next_cursor as string | undefined;
    if (!cursor) break;
  }
  return results;
}
