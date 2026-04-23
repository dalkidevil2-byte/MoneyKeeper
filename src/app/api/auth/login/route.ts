import { NextRequest, NextResponse } from 'next/server';
import { createToken } from '@/lib/auth';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json({ error: '서버에 APP_PASSWORD가 설정되지 않았어요' }, { status: 500 });
  }

  if (password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: '비밀번호가 틀렸어요' }, { status: 401 });
  }

  const token = await createToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30일
    path: '/',
  });
  return res;
}
