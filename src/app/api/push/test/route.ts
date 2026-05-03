export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { sendPushToHousehold, isPushConfigured } from '@/lib/web-push';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * POST /api/push/test
 * body: { household_id?, title?, body? }
 * 테스트 알림 발송
 */
export async function POST(req: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      {
        error:
          'VAPID 키가 설정되지 않았어요. Vercel 환경변수에 NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 추가 후 재배포해주세요.',
      },
      { status: 400 },
    );
  }
  try {
    const body = await req.json().catch(() => ({}));
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const result = await sendPushToHousehold(householdId, {
      title: body.title ?? '🔔 테스트 알림',
      body: body.body ?? '알림이 정상적으로 동작합니다.',
      tag: 'test',
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
