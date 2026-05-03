import webpush from 'web-push';
import { createServerSupabaseClient } from './supabase';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:noreply@example.com';

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return false;
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
    return true;
  } catch (e) {
    console.error('[web-push] VAPID 설정 실패', e);
    return false;
  }
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;       // 알림 클릭 시 이동
  tag?: string;       // 같은 tag 알림은 덮어씀
  icon?: string;
};

/**
 * 가구의 모든 활성 구독에 푸시 전송. 410/404 (만료) 응답 시 자동 비활성화.
 */
export async function sendPushToHousehold(
  householdId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!ensureConfigured()) {
    return { sent: 0, failed: 0, errors: ['VAPID 키 미설정'] };
  }
  const supabase = createServerSupabaseClient();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('household_id', householdId)
    .eq('is_active', true);

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    url: payload.url ?? '/',
    tag: payload.tag,
    icon: payload.icon ?? '/icon',
  });

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          data,
          { TTL: 60 * 60 * 24 }, // 24시간
        );
        sent += 1;
      } catch (e) {
        failed += 1;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          expiredIds.push(s.id as string);
        }
        errors.push(`${(s.endpoint as string).slice(0, 40)}…: ${status ?? 'err'}`);
      }
    }),
  );

  // 만료된 구독 비활성화
  if (expiredIds.length > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false })
      .in('id', expiredIds);
  }

  // 마지막 발송 시각 갱신
  if (sent > 0) {
    await supabase
      .from('push_subscriptions')
      .update({ last_sent_at: new Date().toISOString() })
      .eq('household_id', householdId)
      .eq('is_active', true);
  }

  return { sent, failed, errors };
}

export function isPushConfigured(): boolean {
  return ensureConfigured();
}
