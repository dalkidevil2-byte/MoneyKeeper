import { createServerSupabaseClient } from './supabase';

/**
 * OpenAI 가격표 (USD / 1M tokens or per unit)
 * https://openai.com/api/pricing/
 * 환율은 USD_KRW 환경변수 또는 1380 기본
 */
const PRICING: Record<
  string,
  { input?: number; output?: number; perChar?: number; perSecond?: number }
> = {
  // Chat models — per 1M tokens
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-2024-08-06': { input: 2.5, output: 10 },
  'gpt-4-turbo': { input: 10, output: 30 },
  // Audio
  'tts-1': { perChar: 0.015 / 1000 }, // $0.015 per 1k chars
  'tts-1-hd': { perChar: 0.030 / 1000 },
  'whisper-1': { perSecond: 0.006 / 60 }, // $0.006 per minute
};

const USD_KRW = Number(process.env.USD_KRW ?? '1380');
const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID;

export type AiUsageFeature =
  | 'briefing'
  | 'tts'
  | 'stt'
  | 'assistant'
  | 'condition'
  | 'ocr'
  | 'parse'
  | 'archive_ai'
  | 'weekly_report'
  | 'reminder'
  | 'other';

export interface LogAiUsageInput {
  model: string;
  feature: AiUsageFeature;
  inputTokens?: number;
  outputTokens?: number;
  audioChars?: number;
  audioSeconds?: number;
  householdId?: string;
  meta?: Record<string, unknown>;
}

/** 토큰/문자 단위 → USD 비용 계산 */
export function estimateCostUsd(
  model: string,
  args: Pick<
    LogAiUsageInput,
    'inputTokens' | 'outputTokens' | 'audioChars' | 'audioSeconds'
  >,
): number {
  const p = PRICING[model];
  if (!p) return 0;
  let cost = 0;
  if (p.input && args.inputTokens) cost += (args.inputTokens / 1_000_000) * p.input;
  if (p.output && args.outputTokens) cost += (args.outputTokens / 1_000_000) * p.output;
  if (p.perChar && args.audioChars) cost += args.audioChars * p.perChar;
  if (p.perSecond && args.audioSeconds) cost += args.audioSeconds * p.perSecond;
  return cost;
}

/** Fire-and-forget 로깅. 실패해도 메인 로직 막지 않음 */
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    const costUsd = estimateCostUsd(input.model, input);
    const costKrw = costUsd * USD_KRW;
    const supabase = createServerSupabaseClient();
    await supabase.from('ai_usage').insert({
      household_id: input.householdId ?? DEFAULT_HOUSEHOLD_ID ?? null,
      model: input.model,
      feature: input.feature,
      input_tokens: input.inputTokens ?? 0,
      output_tokens: input.outputTokens ?? 0,
      audio_chars: input.audioChars ?? 0,
      audio_seconds: input.audioSeconds ?? 0,
      cost_usd: costUsd,
      cost_krw: costKrw,
      meta: input.meta ?? {},
    });
  } catch (e) {
    // 절대 throw 하지 않음 — 로깅 실패가 사용자 기능 막으면 안 됨
    console.warn('[ai-usage] log failed:', e);
  }
}
