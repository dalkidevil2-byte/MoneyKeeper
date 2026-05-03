export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateBriefing, type BriefingMode } from '@/lib/daily-briefing';
import { sendPushToHousehold, isPushConfigured } from '@/lib/web-push';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET/POST /api/briefing?mode=morning|evening&push=1
 * - mode 미지정시 시간대 자동 (06~12: morning, 18~24: evening, 그 외: morning)
 * - push=1 이면 PWA 푸시도 발송 (기본은 응답으로만 반환)
 *
 * 외부 cron 에서:
 *   - 매일 07:00 KST: GET /api/briefing?mode=morning&push=1
 *   - 매일 22:00 KST: GET /api/briefing?mode=evening&push=1
 */
async function handle(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const push = searchParams.get('push') === '1';
  const modeParam = searchParams.get('mode');
  let mode: BriefingMode;
  if (modeParam === 'morning' || modeParam === 'evening') {
    mode = modeParam;
  } else {
    const hour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours(); // KST hour
    mode = hour >= 17 ? 'evening' : 'morning';
  }

  try {
    const { title, body } = await generateBriefing(householdId, mode);
    let pushed: { sent: number; failed: number } | null = null;
    if (push && isPushConfigured()) {
      const r = await sendPushToHousehold(householdId, {
        title,
        body,
        tag: `briefing-${mode}-${new Date().toISOString().slice(0, 10)}`,
        url: '/',
      });
      pushed = { sent: r.sent, failed: r.failed };
    }
    return NextResponse.json({ ok: true, mode, title, body, pushed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

export { handle as GET, handle as POST };
