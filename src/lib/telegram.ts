// 텔레그램 봇 API 헬퍼
// 봇 토큰만 있으면 sendMessage / getUpdates 가능

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

async function tgRequest<T>(
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: params ? 'POST' : 'GET',
    headers: params ? { 'Content-Type': 'application/json' } : undefined,
    body: params ? JSON.stringify(params) : undefined,
  });
  const data: ApiResponse<T> = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API ${method} 실패 (${data.error_code})`);
  }
  return data.result as T;
}

export async function sendTelegramMessage(
  token: string,
  chatId: string | number,
  text: string,
): Promise<TelegramMessage> {
  return tgRequest<TelegramMessage>(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

export async function getMe(token: string): Promise<TelegramUser> {
  return tgRequest<TelegramUser>(token, 'getMe');
}

interface UpdateRecord {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

/**
 * 봇과 대화한 사용자 목록을 가져옴 (chat_id 자동 감지용).
 * 텔레그램은 마지막 24시간 내 update 만 보존하므로, 사용자가 봇과 /start 한 직후 호출해야 함.
 */
export async function fetchRecentChats(
  token: string,
): Promise<{ chat_id: string; name: string; username?: string }[]> {
  const updates = await tgRequest<UpdateRecord[]>(token, 'getUpdates', {
    timeout: 0,
    allowed_updates: ['message'],
  });
  const dedup = new Map<string, { chat_id: string; name: string; username?: string }>();
  for (const u of updates) {
    const m = u.message ?? u.edited_message;
    if (!m?.chat) continue;
    if (m.chat.type !== 'private') continue;
    const id = String(m.chat.id);
    if (dedup.has(id)) continue;
    const name = [m.chat.first_name, m.chat.last_name].filter(Boolean).join(' ') || (m.chat.username ?? '');
    dedup.set(id, { chat_id: id, name, username: m.chat.username });
  }
  return Array.from(dedup.values());
}
