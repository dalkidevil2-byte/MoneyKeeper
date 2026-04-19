export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// GET /api/stocks/krx-search?q=삼성
// Supabase stock_krx_stocks 테이블에서 이름/코드/티커 매칭.
// 테이블이 비어있다면 /api/stocks/krx-reload로 채울 것 (추후 구현).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  if (!q) return NextResponse.json([]);

  const supabase = createServerSupabaseClient();

  // 6자리 숫자면 코드 prefix 검색, 아니면 이름 부분 일치 우선
  const isCode = /^\d+$/.test(q);
  const isTicker = /^[A-Za-z0-9.]+$/.test(q);

  const results: Array<{ code: string; ticker: string; name: string; market: string }> = [];
  const seen = new Set<string>();

  // 1) 이름 부분 일치 (ilike)
  const { data: byName } = await supabase
    .from('stock_krx_stocks')
    .select('code, ticker, name, market')
    .ilike('name', `%${q}%`)
    .limit(20);
  for (const row of byName ?? []) {
    if (!seen.has(row.code)) {
      seen.add(row.code);
      results.push(row);
    }
  }

  // 2) 코드 prefix
  if (isCode && results.length < 20) {
    const { data: byCode } = await supabase
      .from('stock_krx_stocks')
      .select('code, ticker, name, market')
      .like('code', `${q}%`)
      .limit(20 - results.length);
    for (const row of byCode ?? []) {
      if (!seen.has(row.code)) {
        seen.add(row.code);
        results.push(row);
      }
    }
  }

  // 3) 티커 prefix
  if (isTicker && results.length < 20) {
    const { data: byTicker } = await supabase
      .from('stock_krx_stocks')
      .select('code, ticker, name, market')
      .ilike('ticker', `${q}%`)
      .limit(20 - results.length);
    for (const row of byTicker ?? []) {
      if (!seen.has(row.code)) {
        seen.add(row.code);
        results.push(row);
      }
    }
  }

  return NextResponse.json(results.slice(0, 20));
}
