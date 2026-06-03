import OpenAI from 'openai';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { createServerSupabaseClient } from './supabase';
import { logAiUsage } from './ai-usage';
import { computeHoldings, aggregateByTicker } from './stock-holdings';
import { searchStockNews, type NewsItem } from './stock-news';

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

  // 5) 어제 가계부 + 카테고리 Top
  const { data: yTxs } = await supabase
    .from('transactions')
    .select('amount, name, category_main')
    .eq('household_id', householdId)
    .eq('date', yesterdayKey)
    .eq('type', 'variable_expense')
    .neq('status', 'cancelled');
  const yesterdaySpent = (yTxs ?? []).reduce((s, t) => s + (t.amount as number), 0);
  const yesterdayCatMap: Record<string, number> = {};
  for (const t of yTxs ?? []) {
    const k = (t.category_main as string) || '기타';
    yesterdayCatMap[k] = (yesterdayCatMap[k] ?? 0) + (t.amount as number);
  }
  const yesterdayTopCats = Object.entries(yesterdayCatMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // 6) 이번 달 누적 지출 + 예산 대비
  const monthStart = today.startOf('month').format('YYYY-MM-DD');
  const { data: mTxs } = await supabase
    .from('transactions')
    .select('amount')
    .eq('household_id', householdId)
    .gte('date', monthStart)
    .lte('date', todayKey)
    .eq('type', 'variable_expense')
    .neq('status', 'cancelled');
  const monthSpent = (mTxs ?? []).reduce((s, t) => s + (t.amount as number), 0);

  // 7-pre) 활성 목표 진행률
  const { data: goals } = await supabase
    .from('goals')
    .select('emoji, title, target_value, current_value, target_date, status')
    .eq('household_id', householdId)
    .eq('status', 'active')
    .limit(5);
  const goalSummary = (goals ?? []).map((g) => {
    const tv = Number(g.target_value) || 0;
    const cv = Number(g.current_value) || 0;
    const pct = tv > 0 ? Math.round((cv / tv) * 100) : 0;
    return {
      title: `${g.emoji ?? '🎯'} ${g.title}`,
      pct,
      target_date: g.target_date as string | null,
    };
  });

  // 7-pre2) 이번 달 예산 (대분류 기준)
  const { data: budgets } = await supabase
    .from('budgets')
    .select('category_main, amount')
    .eq('household_id', householdId)
    .eq('month', today.format('YYYY-MM'));
  const budgetByMain: Record<string, number> = {};
  for (const b of budgets ?? []) {
    budgetByMain[b.category_main as string] = Number(b.amount) || 0;
  }
  // 이번 달 카테고리별 누적 지출 (대분류)
  const { data: mTxsByCat } = await supabase
    .from('transactions')
    .select('amount, category_main')
    .eq('household_id', householdId)
    .gte('date', monthStart)
    .lte('date', todayKey)
    .eq('type', 'variable_expense')
    .neq('status', 'cancelled');
  const spentByMain: Record<string, number> = {};
  for (const t of mTxsByCat ?? []) {
    const k = (t.category_main as string) || '기타';
    spentByMain[k] = (spentByMain[k] ?? 0) + (t.amount as number);
  }
  const budgetStatus = Object.entries(budgetByMain)
    .map(([k, limit]) => {
      const spent = spentByMain[k] ?? 0;
      const ratio = limit > 0 ? Math.round((spent / limit) * 100) : 0;
      return { category: k, spent, limit, ratio };
    })
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);

  // 7-pre3) 주식 포트폴리오 (간단 손익) — 최신 1건
  const { data: latestAsset } = await supabase
    .from('stock_asset_history')
    .select('total_value, date')
    .eq('household_id', householdId)
    .order('date', { ascending: false })
    .limit(1);
  let stockSummary: { value: number; date: string } | null = null;
  if (latestAsset && latestAsset.length > 0) {
    stockSummary = {
      value: Number(latestAsset[0].total_value) || 0,
      date: latestAsset[0].date as string,
    };
  }

  // 7-pre3b) 보유 종목 + 최신 뉴스 (아침 브리핑 전용)
  // household → owners → accounts → transactions → computeHoldings.
  // 보유 비중 상위 종목에 대해 Google News RSS 로 최근 뉴스를 수집한다.
  let holdingNews: Array<{ company: string; news: NewsItem[] }> = [];
  if (mode === 'morning') {
    try {
      const { data: stockOwners } = await supabase
        .from('stock_owners')
        .select('id')
        .eq('household_id', householdId);
      const ownerIds = (stockOwners ?? []).map((o) => o.id as string);
      let stockTxs: unknown[] = [];
      if (ownerIds.length > 0) {
        const { data: accs } = await supabase
          .from('stock_accounts')
          .select('id')
          .in('owner_id', ownerIds);
        const accIds = (accs ?? []).map((a) => a.id as string);
        if (accIds.length > 0) {
          const { data } = await supabase
            .from('stock_transactions')
            .select('id, account_id, ticker, company_name, type, date, quantity, price, created_at')
            .in('account_id', accIds)
            .order('date', { ascending: true });
          stockTxs = data ?? [];
        }
      }
      if (stockTxs.length > 0) {
        const holdings = aggregateByTicker(computeHoldings(stockTxs as never));
        // 보유금액(invested) 상위 3종목만 뉴스 조회 (속도/노이즈 고려)
        const topHoldings = holdings
          .sort((a, b) => b.invested - a.invested)
          .slice(0, 3)
          .filter((h) => h.companyName && h.companyName.trim());
        // 최근 2일 이내 뉴스만 "중요/최신" 으로 간주
        const cutoff = today.subtract(2, 'day').valueOf();
        const results = await Promise.all(
          topHoldings.map(async (h) => {
            const items = await searchStockNews(h.companyName, 5);
            const recent = items
              .filter((n) => {
                if (!n.publishedAt) return false;
                const t = new Date(n.publishedAt).valueOf();
                return !Number.isNaN(t) && t >= cutoff;
              })
              .slice(0, 2);
            return { company: h.companyName, news: recent };
          }),
        );
        holdingNews = results.filter((r) => r.news.length > 0);
      }
    } catch (e) {
      console.warn('[briefing holdingNews]', (e as Error).message);
    }
  }

  // 7-pre4) 카드 청구서 임박 (7일 이내 결제일)
  const sevenDaysLater = today.add(7, 'day').format('YYYY-MM-DD');
  const { data: cards } = await supabase
    .from('card_statements')
    .select('card_name, amount_due, due_date')
    .eq('household_id', householdId)
    .gte('due_date', todayKey)
    .lte('due_date', sevenDaysLater)
    .eq('paid', false);
  const upcomingCards = (cards ?? []).map((c) => ({
    name: c.card_name as string,
    amount: Number(c.amount_due) || 0,
    date: c.due_date as string,
  }));

  // 7) 최근 24시간 새 컬렉션 항목
  const since24h = today.subtract(24, 'hour').toISOString();
  const { data: archEntries } = await supabase
    .from('archive_entries')
    .select('data, created_at, collection:archive_collections!collection_id(name, emoji)')
    .eq('household_id', householdId)
    .gte('created_at', since24h)
    .order('created_at', { ascending: false })
    .limit(8);
  type ArchEntryRaw = {
    data: Record<string, unknown> | null;
    created_at: string;
    collection: { name?: string; emoji?: string } | { name?: string; emoji?: string }[] | null;
  };
  const recentArchive = ((archEntries ?? []) as ArchEntryRaw[]).map((e) => {
    const collRaw = e.collection;
    const coll = Array.isArray(collRaw) ? collRaw[0] : collRaw;
    const data = (e.data ?? {}) as Record<string, unknown>;
    // 첫 번째 텍스트 필드를 제목으로 사용
    const firstVal = Object.values(data).find((v) => typeof v === 'string' && (v as string).trim());
    return {
      collection: coll?.name ?? '?',
      emoji: coll?.emoji ?? '📦',
      title: (firstVal as string) ?? '항목',
    };
  });

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
${tomorrowEvents.slice(0, 5).map((e) => `- ${e.title}`).join('\n') || '없음'}

## 가계부 — 어제 지출
- 총 ${yesterdaySpent.toLocaleString('ko-KR')}원${yesterdayTopCats.length > 0 ? ` (${yesterdayTopCats.map(([c, a]) => `${c} ${a.toLocaleString('ko-KR')}원`).join(', ')})` : ''}
- 이번 달 누적: ${monthSpent.toLocaleString('ko-KR')}원

## 예산 (대분류 Top 5)
${budgetStatus.length === 0 ? '예산 미설정' : budgetStatus.map((b) => `- ${b.category}: ${b.ratio}% 사용 (${b.spent.toLocaleString('ko-KR')}/${b.limit.toLocaleString('ko-KR')}원)`).join('\n')}

## 카드 청구서 임박 (7일 내)
${upcomingCards.length === 0 ? '없음' : upcomingCards.map((c) => `- ${c.date} ${c.name} ${c.amount.toLocaleString('ko-KR')}원`).join('\n')}

## 활성 목표
${goalSummary.length === 0 ? '없음' : goalSummary.map((g) => `- ${g.title}: ${g.pct}%${g.target_date ? ` (${g.target_date}까지)` : ''}`).join('\n')}

## 주식 자산 (최근 스냅샷)
${stockSummary ? `- ${stockSummary.date} 기준 ${stockSummary.value.toLocaleString('ko-KR')}원` : '없음'}

## 보유 종목 관련 최신 뉴스 (최근 2일)
${
  holdingNews.length === 0
    ? '특이 뉴스 없음'
    : holdingNews
        .map(
          (h) =>
            `### ${h.company}\n${h.news.map((n) => `- ${n.title}${n.publisher ? ` (${n.publisher})` : ''}`).join('\n')}`,
        )
        .join('\n')
}

## 최근 컬렉션 등록 (24시간)
${recentArchive.map((a) => `- ${a.emoji} ${a.collection}: ${a.title}`).join('\n') || '없음'}`
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
- ${todaySpent.toLocaleString('ko-KR')}원 (${txCount}건)

## 어제 지출 + 이번 달 누적
- 어제 ${yesterdaySpent.toLocaleString('ko-KR')}원
- 이번 달 누적: ${monthSpent.toLocaleString('ko-KR')}원

## 예산 사용률 (Top 5)
${budgetStatus.length === 0 ? '예산 미설정' : budgetStatus.map((b) => `- ${b.category}: ${b.ratio}%`).join('\n')}

## 활성 목표 진행
${goalSummary.length === 0 ? '없음' : goalSummary.map((g) => `- ${g.title}: ${g.pct}%`).join('\n')}

## 카드 청구서 임박 (7일 내)
${upcomingCards.length === 0 ? '없음' : upcomingCards.map((c) => `- ${c.date} ${c.name} ${c.amount.toLocaleString('ko-KR')}원`).join('\n')}

## 주식 자산 (최근 스냅샷)
${stockSummary ? `- ${stockSummary.value.toLocaleString('ko-KR')}원 (${stockSummary.date})` : '없음'}

## 최근 컬렉션 등록 (24시간)
${recentArchive.map((a) => `- ${a.emoji} ${a.collection}`).join('\n') || '없음'}`;

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

보유 종목 뉴스 처리 (있을 때만):
- '보유 종목 관련 최신 뉴스' 에 항목이 있으면, **정말 중요해 보이는 1~2건만** 골라 짧게 언급.
- "어제 ○○ 관련해서 ~한 소식이 있었어요" 정도로 자연스럽게. 종목명은 언급 OK.
- 단정/투자권유 절대 X. "참고만 하세요" 톤. 주가 예측 X.
- 뉴스가 '특이 뉴스 없음' 이면 주식 얘기 자체를 생략.

데이터 사용 원칙 (러프하게):
- 가계부/컬렉션 등록은 **러프하게만 참고**. 구체적 항목명/금액 단정 X.
- 예: "어제 외식 좀 있었네요" (X "어제 김밥천국 8,000원")
- "이번 달은 평소보다 좀 쓴 편" 정도. 정확한 금액 강조 X.
- 컬렉션 신규 등록은 "관심사가 다양해 보여요" 같은 분위기 언급 정도.
- 데이터가 잘못 입력됐을 가능성 있으니 단정 표현 피하고 "~인 듯" 톤.

톤:
- 친한 누나/형 같은 따뜻함, 데이터 기반 구체성
- 격언/명언 인용 X, 진부함 X
- **이모지/이모티콘 절대 사용 금지** (음성으로 읽히기 때문)`
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

데이터 사용 원칙 (러프하게):
- 가계부/컬렉션은 **러프하게만 참고**. 구체적 항목/금액 단정 X.
- "오늘은 좀 많이 쓴 듯" / "조용한 지출 흐름" 정도.
- 컬렉션 신규 등록은 "오늘 새로 기록한 것들이 있네요" 처럼 분위기만.
- 데이터 오인식 가능성 인정 — 단정 X, "~인 듯" 톤.

톤:
- "수고했어요" 같은 진부한 말 피하고 데이터 활용
- 빈 데이터엔 "쉰 하루" 가치 인정
- 격언 X
- **이모지/이모티콘 절대 사용 금지** (음성으로 읽히기 때문)`;

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
    void logAiUsage({
      model: 'gpt-4o-mini',
      feature: 'briefing',
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      householdId,
      meta: { mode },
    });
    return { title, body };
  } catch (e) {
    console.error('[generateBriefing]', e);
    return {
      title: mode === 'morning' ? '☀️ 아침' : '🌙 저녁',
      body: 'AI 브리핑 생성에 실패했어요.',
    };
  }
}
