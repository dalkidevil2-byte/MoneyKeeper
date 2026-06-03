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

  // 4) DB 결과 부족하면 Naver 검색 fallback (KRX 데이터 불완전 대비, 특히 우선주)
  if (results.length < 5 && !isCode) {
    try {
      const url = `https://m.stock.naver.com/api/search/searchListPage?keyword=${encodeURIComponent(q)}&menu=stock`;
      const r = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Referer: 'https://m.stock.naver.com/',
        },
      });
      if (r.ok) {
        const j = await r.json();
        const list: Array<{ itemCode?: string; reutersCode?: string; stockName?: string; nationCode?: string; marketCategory?: string }> =
          j?.searchList ?? j?.stocks ?? [];
        for (const it of list) {
          const code = it.itemCode ?? '';
          if (!/^\d{6}$/.test(code)) continue;
          if (it.nationCode && it.nationCode !== 'KOR') continue;
          if (seen.has(code)) continue;
          const market = it.marketCategory === 'KOSDAQ' || it.marketCategory === 'KQ' ? 'KOSDAQ' : 'KOSPI';
          const suffix = market === 'KOSDAQ' ? '.KQ' : '.KS';
          results.push({
            code,
            ticker: `${code}${suffix}`,
            name: it.stockName ?? code,
            market,
          });
          seen.add(code);
          if (results.length >= 20) break;
        }
      }
    } catch (e) {
      console.warn('[krx-search naver fallback]', (e as Error).message);
    }
  }

  return NextResponse.json(results.slice(0, 20));
}
