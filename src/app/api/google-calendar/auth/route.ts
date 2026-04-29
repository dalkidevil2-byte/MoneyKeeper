export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google-calendar';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// GET /api/google-calendar/auth → 구글 OAuth consent 화면으로 리다이렉트
export async function GET() {
  // state = household_id 그대로 전달 (단일 가구라 단순화)
  const url = buildAuthUrl(HOUSEHOLD_ID);
  return NextResponse.redirect(url);
}
