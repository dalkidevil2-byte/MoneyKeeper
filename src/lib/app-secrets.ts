import { createServerSupabaseClient } from './supabase';
import { encrypt, decrypt, isEncryptionAvailable } from './crypto';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * 외부 통합 시크릿 조회 (가구별).
 * DB 에 저장된 값 우선, 없으면 env 변수 fallback.
 *
 * @param key 시크릿 키 (예: 'notion_token')
 * @param envFallback env 변수 이름 (예: 'NOTION_TOKEN')
 */
export async function getSecret(
  key: string,
  envFallback?: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID,
): Promise<string | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from('app_secrets')
      .select('value')
      .eq('household_id', householdId)
      .eq('key', key)
      .maybeSingle();
    if (data?.value) {
      const stored = data.value as string;
      // v1: 으로 시작하면 암호화된 값, 아니면 평문 (구 데이터)
      try {
        return decrypt(stored);
      } catch {
        // 복호화 실패 (키 없음/잘못됨) — env 로 fallback
      }
    }
  } catch {
    // 테이블이 아직 없거나 (마이그레이션 전) 에러면 env 로
  }
  if (envFallback) {
    const v = process.env[envFallback];
    if (v) return v;
  }
  return null;
}

export async function setSecret(
  key: string,
  value: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID,
): Promise<void> {
  if (!isEncryptionAvailable()) {
    throw new Error(
      '암호화 키 (APP_ENCRYPTION_KEY) 가 설정되지 않아 시크릿을 저장할 수 없어요. ' +
      'Vercel 환경변수에 32자 이상의 랜덤 문자열로 등록해주세요. ' +
      '예: openssl rand -base64 48',
    );
  }
  const supabase = createServerSupabaseClient();
  const encrypted = encrypt(value);
  await supabase
    .from('app_secrets')
    .upsert(
      {
        household_id: householdId,
        key,
        value: encrypted,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'household_id,key' },
    );
}

export async function deleteSecret(
  key: string,
  householdId: string = DEFAULT_HOUSEHOLD_ID,
): Promise<void> {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('app_secrets')
    .delete()
    .eq('household_id', householdId)
    .eq('key', key);
}
