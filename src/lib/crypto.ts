/**
 * 시크릿 값 암호화/복호화 (AES-256-GCM).
 *
 * Vercel 환경변수 APP_ENCRYPTION_KEY (32자 이상 무작위 문자열) 가 있으면
 * 사용. 없으면 saving 시 거부 (사용자에게 안내).
 *
 * 저장 형식: "v1:<iv_base64>:<tag_base64>:<ciphertext_base64>"
 * 평문이 들어오면 (구버전/외부 데이터) decrypt 가 그대로 반환.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const SALT = 'moneykeeper-app-secret-salt';

function getMasterKey(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY ?? '';
  if (!k || k.length < 16) {
    throw new Error(
      'APP_ENCRYPTION_KEY 가 설정되지 않았거나 너무 짧아요. ' +
      '32자 이상 랜덤 문자열로 Vercel 환경변수에 등록해주세요.',
    );
  }
  return scryptSync(k, SALT, 32);
}

export function encrypt(plain: string): string {
  if (!plain) return '';
  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(payload: string): string {
  if (!payload) return '';
  // v1 prefix 가 없으면 평문 (구 데이터 호환)
  if (!payload.startsWith('v1:')) return payload;
  const parts = payload.split(':');
  if (parts.length !== 4) return payload;
  try {
    const key = getMasterKey();
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const enc = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch (e) {
    // 키 변경/손상 시 에러
    throw new Error(
      '시크릿 복호화 실패 — APP_ENCRYPTION_KEY 가 변경됐거나 데이터가 손상됐을 수 있어요. ' +
      `(${e instanceof Error ? e.message : 'unknown'})`,
    );
  }
}

export function isEncryptionAvailable(): boolean {
  const k = process.env.APP_ENCRYPTION_KEY ?? '';
  return k.length >= 16;
}
