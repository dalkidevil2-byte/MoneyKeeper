import OpenAI from 'openai';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { createServerSupabaseClient } from './supabase';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type BriefingMode = 'morning' | 'evening';

/**
 * 아침/저녁 브리핑 생성. 가구 데이터를 모아서 AI 가 요약 + 한 줄 코멘트.
 */
export async function generateBriefing(
  householdId: string,
  mode: BriefingMode,
): Promise<{ title: string; body: string }> {
  const supabase = createServerSupabaseClient();
  const today = dayjs().tz(KST);
  const todayKey = today.format('YYYY-MM-DD');
  const tomorrowKey = today.add(1, 'day').format('YYYY-MM-DD');
  const yesterdayKey = today.subtract(1, 'day').format('YYYY-MM-DD');

  // 1) 오늘 일정/할일 (이벤트 + 미완료 할일)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, kind, title, due_date, due_time, deadline_date, deadline_time, status, completed_at')
    .eq('household_id', householdId)
    .eq('is_active', true)
    .neq('status', 'cancelled');

  const allTasks = (tasks ?? []) as Array<{
    id: string;
    kind: string;
    title: string;
    due_date: string | null;
    due_time: string | null;
    deadline_date: string | null;
    deadline_time: string | null;
    status: string;
    completed_at: string | null;
  }>;

  const todayEvents = allTasks.filter(
    (t) => t.kind === 'event' && t.due_date === todayKey && t.status !== 'done',
  );
  const todayDoneEvents = allTasks.filter(
    (t) => t.kind === 'event' && t.due_date === todayKey && t.status === 'done',
  );
  const overdueTodos = allTasks.filter(
    (t) =>
      t.kind === 'todo' &&
      t.deadline_date &&
      t.deadline_date < todayKey &&
      t.status !== 'done',
  );
  const todayTodos = allTasks.filter(
    (t) =>
      t.kind === 'todo' &&
      t.deadline_date === todayKey &&
      t.status !== 'done',
  );
  const tomorrowEvents = allTasks.filter(
    (t) => t.kind === 'event' && t.due_date === tomorrowKey,
  );
  const todayDoneTodos = allTasks.filter(
    (t) =>
      t.kind === 'todo' &&
      t.completed_at &&
      t.completed_at.slice(0, 10) === todayKey,
  );

  // 2) Daily Track 오늘 상태
  const { data: tracks } = await supabase
    .from('daily_tracks')
    .select('id, title, emoji, period_unit, target_count')
    .eq('household_id', householdId)
    .eq('is_active', true);
  const trackIds = (tracks ?? []).map((t) => t.id as string);
  const { data: trackLogs } =
    trackIds.length > 0
      ? await supabase
          .from('daily_track_logs')
          .select('track_id, done_on')
          .in('track_id', trackIds)
          .eq('done_on', todayKey)
      : { data: [] };
  const doneTrackIds = new Set((trackLogs ?? []).map((l) => l.track_id as string));
  const trackList = (tracks ?? []).map((t) => ({
    title: t.title as string,
    emoji: t.emoji as string,
    done: doneTrackIds.has(t.id as string),
  }));

  // 3) 오늘 활동 시간
  const { data: actSessions } = await supabase
    .from('activity_sessions')
    .select('activity_id, duration_minutes, activities!activity_id(name)')
    .eq('household_id', householdId)
    .eq('session_date', todayKey)
    .not('duration_minutes', 'is', null);
  const actMap = new Map<string, number>();
  for (const s of actSessions ?? []) {
    const name = ((s as unknown as { activities: { name: string } }).activities)
      ?.name ?? '?';
    actMap.set(name, (actMap.get(name) ?? 0) + ((s.duration_minutes as number) ?? 0));
  }
  const actList = Array.from(actMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, min]) => ({ name, minutes: min }));

  // 4) 오늘 가계부 (변동지출)
  const { data: txs } = await supabase
    .from('transactions')
    .select('amount, type, name, category_main')
    .eq('household_id', householdId)
    .eq('date', todayKey)
    .eq('type', 'variable_expense')
    .neq('status', 'cancelled');
  const todaySpent = (txs ?? []).reduce((s, t) => s + (t.amount as number), 0);
  const txCount = (txs ?? []).length;

  // ─── LLM 프롬프트 ────────────────────────────
  const dataBlock =
    mode === 'morning'
      ? `# 오늘의 데이터 (${todayKey} ${today.format('dddd')})

## 오늘 예정 일정 (${todayEvents.length}건)
${
  todayEvents
    .slice(0, 8)
    .map(
      (e) =>
        `- ${e.due_time ? e.due_time.slice(0, 5) : '시간 미정'} ${e.title}`,
    )
    .join('\n') || '없음'
}

## 오늘/지난 할일
- 오늘 마감: ${todayTodos.map((t) => t.title).join(', ') || '없음'}
- 지난 미완료: ${overdueTodos.length}건${overdueTodos.length > 0 ? ` (${overdueTodos.slice(0, 3).map((t) => t.title).join(', ')}${overdueTodos.length > 3 ? '...' : ''})` : ''}

## Daily Track (오늘 진행 상황)
${trackList.map((t) => `- ${t.emoji} ${t.title}${t.done ? ' ✅' : ''}`).join('\n') || '없음'}

## 내일 예정 일정 (${tomorrowEvents.length}건)
${tomorrowEvents.slice(0, 5).map((e) => `- ${e.title}`).join('\n') || '없음'}`
      : `# 오늘 마감 데이터 (${todayKey} ${today.format('dddd')})

## 완료한 일정 (${todayDoneEvents.length}건)
${todayDoneEvents.slice(0, 8).map((e) => `- ${e.title}`).join('\n') || '없음'}

## 못 끝낸 오늘 일정 (${todayEvents.length}건)
${todayEvents.slice(0, 5).map((e) => `- ${e.title}`).join('\n') || '없음'}

## 완료한 할일 (${todayDoneTodos.length}건)
${todayDoneTodos.slice(0, 8).map((t) => `- ${t.title}`).join('\n') || '없음'}

## 지난 미완료 할일
${overdueTodos.length}건${overdueTodos.length > 0 ? ` (${overdueTodos.slice(0, 3).map((t) => t.title).join(', ')}${overdueTodos.length > 3 ? '...' : ''})` : ''}

## Daily Track 결과
${trackList.map((t) => `- ${t.emoji} ${t.title}: ${t.done ? '✅ 달성' : '❌ 미달'}`).join('\n') || '없음'}

## 활동 시간 (Top 5)
${actList.map((a) => `- ${a.name}: ${a.minutes}분`).join('\n') || '없음'}

## 오늘 변동 지출
- ${todaySpent.toLocaleString('ko-KR')}원 (${txCount}건)`;

  const systemPrompt =
    mode === 'morning'
      ? `당신은 사용자의 하루 시작을 돕는 따뜻하고 든든한 AI 비서입니다.
오늘의 데이터를 보고 **상황에 맞는** 아침 브리핑을 작성하세요 (4~6문장).

데이터 보고 먼저 상황 판단:
- 일정/할일 많음 → 우선순위 잡아주고 "차근차근" 톤
- 일정/할일 거의 없음 → "오늘은 여유로운 날이네요" + 자기관리/작은 시도 권유
- 지난 미완료 많음 → 부담 없이 "오늘 1~2개만 처리하면" 리프레임
- 일정 0건 + 할일 0건 → "온전히 본인을 위한 하루" 권유 (휴식, 산책, 영화 등)

상황별 구성:
1. 인사 + 오늘 상황 한 줄 요약
2. 핵심 일정/할일 (있으면 시간/우선순위)
3. 상황에 맞는 격려 / 힘이 나는 말 (구체적으로)
4. 실용 조언 (컨디션·시간배분·작은 팁)
5. 마지막 응원

톤:
- 친한 누나/형 같은 따뜻함, 데이터 기반 구체성
- 격언/명언 인용 X, 진부함 X
- 이모지 적절히`
      : `당신은 사용자의 하루 마무리를 돕는 따뜻하고 든든한 AI 비서입니다.
오늘 데이터를 보고 **상황에 맞는** 저녁 회고를 작성하세요 (4~6문장).

상황 판단 (먼저!):
- 일정 0건 + 할일 0건 + 활동도 거의 없음 → "온전히 쉰 하루" 인정 + 푹 쉬었냐 톤
  + 내일 일정 있으면 "충전된 마음으로 다시 해보자" 식
- 완료 많음 + 활동 시간 많음 → 진심 어린 인정 + 무리 안 했나 걱정
- 미완료 많음 → 자책 X, "내일 우선순위 정리" 톤
- Daily Track 다 달성 → 구체적으로 칭찬
- Daily Track 일부 미달 → "괜찮다" 톤 + 어떤 패턴 보이는지 짧게
- 활동 시간 패턴 (운동/공부/수면) → 발견된 인사이트 짧게

구성:
1. 오늘 어떤 하루였는지 한 줄 (데이터 기반 진단)
2. 잘한 부분 / 또는 쉰 부분 인정 (단순 칭찬 X)
3. 마음에 와닿는 위로 — 본인 상황에 맞춤
4. 내일을 위한 조언 (컨디션 회복, 우선순위, 작은 팁)
5. 따뜻한 한 줄 (잘 자, 푹 쉬어 등)

톤:
- "수고했어요" 같은 진부한 말 피하고 데이터 활용
- 빈 데이터엔 "쉰 하루" 가치 인정
- 격언 X, 이모지 적절히`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: dataBlock },
      ],
      temperature: 0.7,
    });
    const body = res.choices[0]?.message?.content?.trim() ?? '';
    const title = mode === 'morning' ? '☀️ 아침 브리핑' : '🌙 저녁 회고';
    return { title, body };
  } catch (e) {
    console.error('[generateBriefing]', e);
    return {
      title: mode === 'morning' ? '☀️ 아침' : '🌙 저녁',
      body: 'AI 브리핑 생성에 실패했어요.',
    };
  }
}
