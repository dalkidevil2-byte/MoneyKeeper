export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTelegramMessage } from '@/lib/telegram';
import OpenAI from 'openai';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { executeTool } from '@/lib/assistant-tools';

dayjs.extend(utc);
dayjs.extend(timezone);
const TZ = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 주간 리포트 생성 + 텔레그램 발송.
 * cron: 매주 일요일 21시 (cron-job.org 또는 Vercel Cron Pro)
 *
 * 데이터 수집 (지난 주):
 * - get_week_stats(week_offset=-1)
 * - get_goal_progress
 * - get_time_breakdown
 * - get_stock_portfolio (있으면)
 *
 * → LLM 요약 + 어드바이스 1~2줄 → 텔레그램
 */
async function handle(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const dryRun = new URL(req.url).searchParams.get('dry') === '1';

  try {
    // 데이터 수집
    const [weekStats, goalProgress, timeBreakdown, stockPortfolio] = await Promise.all([
      executeTool(householdId, 'get_week_stats', { week_offset: -1 }),
      executeTool(householdId, 'get_goal_progress', {}),
      executeTool(householdId, 'get_time_breakdown', {
        date_from: dayjs().tz(TZ).startOf('week').subtract(1, 'week').format('YYYY-MM-DD'),
        date_to: dayjs().tz(TZ).startOf('week').subtract(1, 'day').format('YYYY-MM-DD'),
        group_by: 'category',
      }),
      executeTool(householdId, 'get_stock_portfolio', {}),
    ]);

    // LLM 요약 생성
    const promptData = JSON.stringify({
      week_stats: weekStats.ok ? weekStats.data : null,
      goals: goalProgress.ok ? goalProgress.data : null,
      time_breakdown: timeBreakdown.ok ? timeBreakdown.data : null,
      stock_portfolio: stockPortfolio.ok ? stockPortfolio.data : null,
    });

    const systemPrompt = `당신은 사용자의 주간 리포트를 작성하는 AI 어시스턴트입니다.

다음 데이터를 보고 짧은 텔레그램 메시지로 정리하세요:

형식 (한국어):
📊 *주간 리포트* — [지난주 날짜]

📅 일정·할일
• 완료 N/M (X%)
• 핵심 1줄

🎯 목표 진행
• 각 목표 진행률 1줄

⏰ 시간 분배 (상위 3개)
• 카테고리1 X시간
• 카테고리2 Y시간

💼 주식 (있으면)
• 평가 X · 손익 +Y%

💡 어드바이스 (1~2줄)
패턴이나 부족한 점 발견 시 짧고 따뜻하게.

이모지 적절, 한 줄당 짧게. 한국어. *bold*는 텔레그램 마크다운.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `오늘은 ${dayjs().tz(TZ).format('YYYY-MM-DD (ddd)')}입니다.\n\n데이터:\n${promptData}`,
        },
      ],
      temperature: 0.6,
      max_tokens: 600,
    });

    const reportText =
      completion.choices[0]?.message?.content?.trim() ?? '리포트 생성 실패';

    if (dryRun) {
      return NextResponse.json({ ok: true, report: reportText });
    }

    // 텔레그램 발송 — 모든 등록 멤버
    const { data: tg } = await supabase
      .from('telegram_settings')
      .select('bot_token, enabled')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!tg?.bot_token || tg.enabled === false) {
      return NextResponse.json({
        ok: true,
        report: reportText,
        reason: 'tg disabled',
      });
    }

    const { data: members } = await supabase
      .from('members')
      .select('telegram_chat_id')
      .eq('household_id', householdId)
      .eq('is_active', true);

    let sent = 0;
    for (const m of members ?? []) {
      if (!m.telegram_chat_id) continue;
      try {
        await sendTelegramMessage(
          tg.bot_token,
          m.telegram_chat_id as string,
          reportText,
        );
        sent++;
      } catch (e) {
        console.warn('[weekly report] send fail', e);
      }
    }

    return NextResponse.json({ ok: true, sent, report: reportText });
  } catch (e) {
    console.error('[weekly report]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as POST, handle as GET };
