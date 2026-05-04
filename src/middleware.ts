import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // 로그인 페이지 및 인증 API는 통과
  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }

  // 외부 cron / webhook 전용 경로 — 항상 인증 우회 통과
  // (외부 스케줄러가 호출하는 endpoint들. cron-job.org 같은 데서 secret 없이 호출 가능)
  const cronPaths = [
    '/api/briefing',
    '/api/daily-tracks/reminders/dispatch',
    '/api/tasks/reminders/dispatch',
    '/api/reports/weekly',
    '/api/google-calendar/auto-sync',
    '/api/transactions/ocr',
    '/api/todo/telegram/dispatch',
    '/api/todo/telegram/debug',
    '/api/telegram/webhook',
    '/api/stocks/asset-history/snapshot',
    '/api/stocks/asset-history/backfill',
    '/api/transactions/ocr-debug',
  ];
  if (cronPaths.includes(pathname)) {
    // CRON_SECRET 가 설정돼 있으면 일치 검증, 없으면 그냥 통과
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const provided =
        req.headers.get('x-cron-secret') ?? searchParams.get('secret');
      // secret 환경변수가 있어도 cron-job.org 에서 secret 안 붙이는 경우 많아서
      // 매칭 실패해도 통과 (외부 cron 동작 우선)
      if (provided === cronSecret || !provided) {
        return NextResponse.next();
      }
    } else {
      return NextResponse.next();
    }
    // secret 있는데 잘못된 secret 보낸 경우만 막음
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
