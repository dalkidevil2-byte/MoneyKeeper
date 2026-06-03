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

  // 4-pre0) 자주 쓰는 우선주 하드코딩 매핑 (DB 에 우선주 없음 대비)
  const PREFERRED_STOCKS: Record<string, { code: string; name: string }> = {
    '삼성전자우': { code: '005935', name: '삼성전자우' },
    '삼성전자우선': { code: '005935', name: '삼성전자우' },
    '현대차우': { code: '005385', name: '현대차우' },
    'lg전자우': { code: '066575', name: 'LG전자우' },
    '엘지전자우': { code: '066575', name: 'LG전자우' },
    'sk이노베이션우': { code: '096775', name: 'SK이노베이션우' },
    '한화에어로스페이스우': { code: '012455', name: '한화에어로스페이스우' },
    '아모레퍼시픽우': { code: '090435', name: '아모레퍼시픽우' },
    '삼성sds우': { code: '018262', name: '삼성SDS우' },
    'lg화학우': { code: '051915', name: 'LG화학우' },
    '엘지화학우': { code: '051915', name: 'LG화학우' },
    'lg생활건강우': { code: '051905', name: 'LG생활건강우' },
    '엘지생활건강우': { code: '051905', name: 'LG생활건강우' },
    '삼성화재우': { code: '000815', name: '삼성화재우' },
    '미래에셋증권우': { code: '006805', name: '미래에셋증권우' },
    '대신증권우': { code: '003545', name: '대신증권우' },
    'sk우': { code: '034730', name: 'SK우' },
    '현대모비스우': { code: '012335', name: '현대모비스우' },
  };
  const ql = q.toLowerCase().replace(/\s/g, '');
  if (PREFERRED_STOCKS[ql] && !seen.has(PREFERRED_STOCKS[ql].code)) {
    const p = PREFERRED_STOCKS[ql];
    results.push({
      code: p.code,
      ticker: `${p.code}.KS`,
      name: p.name,
      market: 'KOSPI',
    });
    seen.add(p.code);
  }

  // 4-pre) 6자리 코드 직접 입력 시 Yahoo quote 로 직접 검증 (가장 확실)
  if (isCode && /^\d{6}$/.test(q) && results.length === 0) {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    };
    for (const suffix of ['.KS', '.KQ']) {
      try {
        const sym = `${q}${suffix}`;
        const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${sym}`;
        const r = await fetch(url, { headers });
        if (!r.ok) continue;
        const j = await r.json();
        const found = j?.quoteResponse?.result?.[0];
        if (found?.regularMarketPrice && found?.shortName) {
          results.push({
            code: q,
            ticker: sym,
            name: found.shortName,
            market: suffix === '.KQ' ? 'KOSDAQ' : 'KOSPI',
          });
          seen.add(q);
          break;
        }
      } catch {
        /* skip */
      }
    }
  }

  // 4) DB 결과 부족하면 외부 fallback (Yahoo + Naver 동시 시도)
  if (results.length < 5) {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    };

    // 4-1) Yahoo Finance search
    try {
      const yUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&lang=ko-KR&region=KR&quotesCount=10`;
      const yr = await fetch(yUrl, { headers });
      if (yr.ok) {
        const yj = await yr.json();
        const quotes: Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }> =
          yj?.quotes ?? [];
        for (const qt of quotes) {
          const sym = qt.symbol ?? '';
          // 한국 주식 형식: 005935.KS, 035420.KQ
          const m = sym.match(/^(\d{6})\.(KS|KQ)$/);
          if (!m) continue;
          const code = m[1];
          if (seen.has(code)) continue;
          const market = m[2] === 'KQ' ? 'KOSDAQ' : 'KOSPI';
          results.push({
            code,
            ticker: sym,
            name: qt.shortname ?? qt.longname ?? code,
            market,
          });
          seen.add(code);
          if (results.length >= 20) break;
        }
      }
    } catch (e) {
      console.warn('[krx-search yahoo]', (e as Error).message);
    }

    // 4-2) Naver search (총합 검색)
    if (results.length < 5) {
      try {
        const nUrl = `https://m.stock.naver.com/front-api/search/autoComplete?query=${encodeURIComponent(q)}&target=stock`;
        const nr = await fetch(nUrl, { headers: { ...headers, Referer: 'https://m.stock.naver.com/' } });
        if (nr.ok) {
          const nj = await nr.json();
          const items: Array<{ code?: string; nameKor?: string; name?: string; nationType?: string; reutersCode?: string }> =
            nj?.result?.items ?? nj?.items ?? [];
          for (const it of items) {
            const code = it.code ?? '';
            if (!/^\d{6}$/.test(code)) continue;
            if (it.nationType && it.nationType !== 'KOR') continue;
            if (seen.has(code)) continue;
            const reuters = it.reutersCode ?? '';
            const suffix = reuters.endsWith('.KS') || reuters.endsWith('.KQ') ? reuters.slice(-3) : '.KS';
            results.push({
              code,
              ticker: `${code}${suffix}`,
              name: it.nameKor ?? it.name ?? code,
              market: suffix === '.KQ' ? 'KOSDAQ' : 'KOSPI',
            });
            seen.add(code);
            if (results.length >= 20) break;
          }
        }
      } catch (e) {
        console.warn('[krx-search naver]', (e as Error).message);
      }
    }
  }

  return NextResponse.json(results.slice(0, 20));
}
