// 슬랙 봇 API 헬퍼 — 봇 토큰(xoxb-)으로 chat.postMessage 발송.
// 브리핑/알림을 슬랙 채널에 봇(집사-클코) 명의로 보낼 때 사용.

interface SlackApiResponse {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
}

/**
 * 슬랙 채널에 메시지 발송 (chat.postMessage).
 * @param token  봇 토큰 (xoxb-...)
 * @param channel 채널 ID (예: C0B7ZV6LR3L)
 * @param text   mrkdwn 텍스트 (*굵게*, _기울임_ 등)
 */
export async function sendSlackMessage(
  token: string,
  channel: string,
  text: string,
): Promise<SlackApiResponse> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      text,
      mrkdwn: true,
      unfurl_links: false,
      unfurl_media: false,
    }),
  });
  const data: SlackApiResponse = await res.json();
  if (!data.ok) {
    throw new Error(data.error || 'Slack chat.postMessage 실패');
  }
  return data;
}

/**
 * GitHub markdown 일부를 Slack mrkdwn 으로 변환.
 * - **bold** → *bold*
 * - # Header → *Header*
 * - [text](url) → <url|text>
 */
export function toSlackMrkdwn(md: string): string {
  return md
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/^[ \t]*#{1,6}[ \t]+(.+)$/gm, '*$1*')
    .replace(/\[([^\][]+)\]\(([^)\s]+)\)/g, '<$2|$1>');
}
