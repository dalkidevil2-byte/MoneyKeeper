export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import { createServerSupabaseClient } from '@/lib/supabase';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';

dayjs.locale('ko');

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ParsedTaskDraft {
  kind: 'event' | 'todo';
  start_date: string | null;
  deadline_date: string | null;
  deadline_time: string | null;
  type: 'one_time' | 'routine';
  title: string;
  is_fixed: boolean;
  due_date: string | null;
  end_date: string | null;
  due_time: string | null;
  end_time: string | null;
  member_ids: string[];
  category_main: string;
  category_sub: string;
  priority: 'low' | 'normal' | 'high';
  recurrence:
    | { freq: 'daily' }
    | { freq: 'weekly'; weekdays: number[] }
    | { freq: 'monthly'; lunar?: boolean }
    | { freq: 'yearly'; lunar?: boolean }
    | { freq: 'interval'; every_days: number }
    | null;
  memo: string;
  confidence: 'high' | 'medium' | 'low';
}

// POST /api/tasks/parse  body: { text }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text: string = (body.text ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: '입력이 비어있습니다.' }, { status: 400 });
    }

    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const supabase = createServerSupabaseClient();

    // 멤버 + 사용자 정의 카테고리 가져와서 LLM 컨텍스트 풍부화
    const { data: members } = await supabase
      .from('members')
      .select('id, name')
      .eq('household_id', householdId)
      .eq('is_active', true);
    const { data: customCats } = await supabase
      .from('custom_categories')
      .select('category_main, category_sub')
      .eq('household_id', householdId);

    const memberList = (members ?? []).map((m) => ({
      id: m.id as string,
      name: m.name as string,
    }));
    const memberLines = memberList.map((m) => `- ${m.name} (id: ${m.id})`).join('\n');

    const allMains = Array.from(
      new Set<string>([
        ...CATEGORY_MAIN_OPTIONS,
        ...((customCats ?? []).map((c) => c.category_main as string).filter(Boolean)),
      ]),
    );
    const subMap: Record<string, string[]> = { ...CATEGORY_SUB_MAP };
    for (const c of customCats ?? []) {
      const main = c.category_main as string;
      const sub = c.category_sub as string;
      if (!main) continue;
      if (!subMap[main]) subMap[main] = [];
      if (sub && !subMap[main].includes(sub)) subMap[main].push(sub);
    }

    const today = dayjs();
    const dateContext = `오늘은 ${today.format('YYYY-MM-DD (dddd)')} 입니다.`;

    const systemPrompt = `당신은 한국어 자연어를 일정(할일/루틴) JSON 으로 정확하게 변환하는 어시스턴트입니다.
${dateContext}

[가족 멤버] 노션/사용자가 부르는 이름과 매칭하면 됩니다. 매칭되면 member_ids 에 id 만 넣으세요.
${memberLines || '- (등록된 멤버 없음)'}

[카테고리 후보 — 적절한 게 있으면 사용, 아니면 빈 문자열]
대분류: ${allMains.join(', ')}

[규칙]
- kind:
  - "event" — 특정 날짜·시간에 해야 하는 일정. "내일 3시 회의", "5월 20일 약속", "매주 월요일 헬스" 등 시각/날짜가 명확하면 event.
  - "todo" — 기한까지 끝내면 되는 작업. "이번 주까지 보고서", "5월 안에 논문", "내일까지 책 읽기" 등 마감/까지 표현이 두드러지면 todo. 시각이 안 잡혀있고 그냥 "사야 함", "하기" 처럼 끝나면 todo 도 가능.
  - 애매하면 event 로.
- todo 면 deadline_date 와 (선택) deadline_time 채우고 due_date/due_time 은 null. is_fixed=false. recurrence=null.
  - 기간 표현이 있으면 start_date 도 함께. 예: "5/1부터 5/10까지 보고서" → start_date=5/1, deadline_date=5/10. "다음주 안에" → start_date=다음주 월요일, deadline_date=다음주 일요일. 단순 마감만 있으면 start_date=null.
- event 면 due_date/due_time 채우고 deadline 은 null.
- type: 반복 표현(매일/매주/매달/요일별/N일마다)이면 "routine", 그 외 단일 일정이면 "one_time"
- 날짜: "내일/오늘/어제/모레", "월/일", "다음주 월요일" 같은 표현을 양력 ISO YYYY-MM-DD 로 변환
- 시간: "오전 9시", "9시 30분", "오후 2시" → 24h "HH:MM:SS". 있으면 is_fixed=true
- 시간 범위: "9시부터 11시까지" → due_time, end_time. 단일 시간이면 end_time 은 null 또는 +1시간
- 기간 일정 (one_time): "내일부터 모레까지" 같이 여러 날 → due_date, end_date 둘 다 채움
- 우선순위: "급하게/꼭" → high, "여유 있을 때" → low, 그 외 normal
- 루틴 recurrence:
  - "매일" → {"freq":"daily"}
  - "월/수/금" 또는 "주 N회 특정요일" → {"freq":"weekly","weekdays":[0~6, 일=0]}
  - "매월" 또는 "매달" → {"freq":"monthly"}
  - "매년" → {"freq":"yearly"} (생일/기념일 → lunar:true 가능. "음력" 명시 시)
  - "3일마다" → {"freq":"interval","every_days":3}
- 시간 정보 없는 종일 일정이면 due_time/end_time = null, is_fixed=false
- 가족 이름이 안 나오면 member_ids 빈 배열
- confidence: 모호하면 "low", 충분하면 "high"

[출력]
오직 JSON 한 객체만 출력. 다른 설명 금지. JSON 키:
{
  "kind": "event" | "todo",
  "start_date": "YYYY-MM-DD" 또는 null,
  "deadline_date": "YYYY-MM-DD" 또는 null,
  "deadline_time": "HH:MM:SS" 또는 null,
  "type": "one_time" | "routine",
  "title": "짧은 제목",
  "is_fixed": false,
  "due_date": "YYYY-MM-DD" 또는 null,
  "end_date": "YYYY-MM-DD" 또는 null,
  "due_time": "HH:MM:SS" 또는 null,
  "end_time": "HH:MM:SS" 또는 null,
  "member_ids": ["uuid", ...],
  "category_main": "",
  "category_sub": "",
  "priority": "normal",
  "recurrence": null 또는 위 형식 객체,
  "memo": "",
  "confidence": "high"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      temperature: 0.2,
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let draft: ParsedTaskDraft;
    try {
      draft = JSON.parse(raw);
    } catch {
      // 일부 모델이 ```json 코드블록으로 감쌀 때 대비
      const m = raw.match(/\{[\s\S]*\}/);
      draft = m ? JSON.parse(m[0]) : ({} as ParsedTaskDraft);
    }

    // 안전 기본값
    draft.kind = draft.kind === 'todo' ? 'todo' : 'event';
    draft.type = draft.type === 'routine' ? 'routine' : 'one_time';
    draft.title = (draft.title ?? text.slice(0, 40)).trim() || text.slice(0, 40);
    draft.is_fixed = !!draft.is_fixed && !!draft.due_time;
    draft.member_ids = Array.isArray(draft.member_ids) ? draft.member_ids : [];
    // member_ids 가 이름으로 들어왔다면 보정
    if (draft.member_ids.some((x) => typeof x === 'string' && !x.includes('-'))) {
      const nameToId = new Map(memberList.map((m) => [m.name, m.id]));
      draft.member_ids = (draft.member_ids as unknown as string[])
        .map((nameOrId) => nameToId.get(nameOrId) ?? (nameOrId.includes('-') ? nameOrId : null))
        .filter((x): x is string => !!x);
    }
    draft.category_main = draft.category_main ?? '';
    draft.category_sub = draft.category_sub ?? '';
    draft.priority = (['low', 'normal', 'high'] as const).includes(
      draft.priority as 'low' | 'normal' | 'high',
    )
      ? draft.priority
      : 'normal';
    draft.confidence = (['high', 'medium', 'low'] as const).includes(
      draft.confidence as 'high' | 'medium' | 'low',
    )
      ? draft.confidence
      : 'medium';
    if (draft.kind === 'todo') {
      // todo 일관성
      draft.type = 'one_time';
      draft.is_fixed = false;
      draft.recurrence = null;
      draft.due_date = null;
      draft.end_date = null;
      draft.due_time = null;
      draft.end_time = null;
      if (!draft.deadline_date) draft.deadline_date = today.format('YYYY-MM-DD');
      // start_date 가 deadline_date 보다 늦으면 무효화
      if (
        draft.start_date &&
        draft.deadline_date &&
        draft.start_date > draft.deadline_date
      ) {
        draft.start_date = null;
      }
    } else {
      // event 일관성
      draft.start_date = null;
      draft.deadline_date = null;
      draft.deadline_time = null;
      if (!draft.due_date) draft.due_date = today.format('YYYY-MM-DD');
      if (draft.type === 'routine' && !draft.recurrence) {
        draft.recurrence = { freq: 'daily' };
      }
      if (draft.type === 'one_time') {
        draft.recurrence = null;
        if (!draft.end_date) draft.end_date = draft.due_date;
      }
    }

    return NextResponse.json({ draft, raw_input: text });
  } catch (error: any) {
    console.error('[POST /tasks/parse]', error);
    return NextResponse.json(
      { error: error?.message ?? '파싱 실패' },
      { status: 500 },
    );
  }
}
