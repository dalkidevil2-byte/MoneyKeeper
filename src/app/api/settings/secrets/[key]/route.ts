export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { setSecret, deleteSecret } from '@/lib/app-secrets';
import { decrypt, isEncryptionAvailable } from '@/lib/crypto';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

const ALLOWED_KEYS = new Set(['notion_token', 'notion_default_database_id']);

/**
 * GET /api/settings/secrets/[key]?household_id=...
 * 보안상 실제 값을 반환하지 않고, 설정 여부 + 마스킹된 미리보기만.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: '허용되지 않은 키' }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  const { data } = await supabase
    .from('app_secrets')
    .select('value, updated_at')
    .eq('household_id', householdId)
    .eq('key', key)
    .maybeSingle();
  if (!data?.value) {
    return NextResponse.json({
      set: false,
      encryption_available: isEncryptionAvailable(),
    });
  }
  // 마스킹용으로 복호화 시도 (암호화된 값이면)
  let plain = data.value as string;
  try {
    plain = decrypt(plain);
  } catch {
    plain = '(복호화 실패)';
  }
  const masked =
    plain.length > 8 ? `${plain.slice(0, 4)}••••${plain.slice(-4)}` : '••••';
  return NextResponse.json({
    set: true,
    masked,
    updated_at: data.updated_at,
    encryption_available: isEncryptionAvailable(),
  });
}

/**
 * POST /api/settings/secrets/[key]
 * body: { value, household_id? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: '허용되지 않은 키' }, { status: 400 });
  }
  try {
    const body = await req.json();
    const value: string = body.value ?? '';
    const householdId: string = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    if (!value.trim()) {
      return NextResponse.json({ error: '값이 비어있어요' }, { status: 400 });
    }
    await setSecret(key, value.trim(), householdId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/settings/secrets/[key]?household_id=...
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ error: '허용되지 않은 키' }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  await deleteSecret(key, householdId);
  return NextResponse.json({ ok: true });
}
