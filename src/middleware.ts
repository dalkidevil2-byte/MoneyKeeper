import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 로그인 페이지 및 인증 API는 통과
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // 외부 cron 호출용 엔드포인트 — CRON_SECRET 일치 시 인증 우회
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    (pathname === '/api/todo/telegram/dispatch' ||
      pathname === '/api/google-calendar/auto-sync')
  ) {
    const provided =
      req.headers.get('x-cron-secret') ?? searchParams.get('secret');
    if (provided && provided === cronSecret) {
      return NextResponse.next();
    }
  }

  const token = req.cookies.get('auth_token')?.value;
  if (!token || !verifyToken(token)) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon|manifest\\.json|public).*)'],
};
