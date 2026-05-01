'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { aggregateByTicker, computeHoldings, type StockTx } from '@/lib/stock-holdings';

type Quote = {
  symbol: string;
  regularMarketPrice?: number;
};

type Summary = {
  current: number;
  invested: number;
  unrealized: number;
  unrealizedPct: number;
  holdingsCount: number;
} | null;

const STORAGE_KEY = 'home:stock_amount_hidden';

export default function StockSummary() {
  const [summary, setSummary] = useState<Summary>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === '1') setHidden(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleHidden = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHidden((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const txRes = await fetch('/api/stocks/transactions?limit=2000');
        const txJson = await txRes.json();
        const txs: StockTx[] = txJson.transactions ?? [];

        const aggregated = aggregateByTicker(computeHoldings(txs));
        if (aggregated.length === 0) {
          if (!cancelled) {
            setSummary({ current: 0, invested: 0, unrealized: 0, unrealizedPct: 0, holdingsCount: 0 });
          }
          return;
        }

        const tickers = aggregated.map((a) => a.ticker);
        const qRes = await fetch(
          `/api/stocks/quote?symbols=${encodeURIComponent(tickers.join(','))}`
        );
        const qJson = await qRes.json();
        const results: Quote[] = qJson?.quoteResponse?.result ?? [];
        const priceMap: Record<string, number> = {};
        for (const r of results) {
          if (r.regularMarketPrice != null) priceMap[r.symbol] = r.regularMarketPrice;
        }

        let invested = 0;
        let current = 0;
        for (const a of aggregated) {
          invested += a.invested;
          current += a.qty * (priceMap[a.ticker] ?? a.avgPrice);
        }
        const unrealized = current - invested;
        const unrealizedPct = invested > 0 ? (unrealized / invested) * 100 : 0;

        if (!cancelled) {
          setSummary({
            current,
            invested,
            unrealized,
            unrealizedPct,
            holdingsCount: aggregated.length,
          });
        }
      } catch {
        if (!cancelled) {
          setSummary({ current: 0, invested: 0, unrealized: 0, unrealizedPct: 0, holdingsCount: 0 });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const mask = '••••••';

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {summary === null ? (
        <div className="text-xs text-gray-400">불러오는 중…</div>
      ) : summary.holdingsCount === 0 ? (
        <div className="text-xs text-gray-400">보유 종목이 없습니다</div>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-gray-500 inline-flex items-center gap-1">
              총 평가액
              <button
                onClick={toggleHidden}
                className="p-0.5 text-gray-400 hover:text-gray-600"
                aria-label={hidden ? '금액 보기' : '금액 가리기'}
                title={hidden ? '금액 보기' : '금액 가리기'}
              >
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </span>
            <span className="text-sm font-bold text-gray-900">
              {hidden ? mask : `${Math.round(summary.current).toLocaleString('ko-KR')}원`}
            </span>
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[11px] text-gray-400">
              {summary.holdingsCount}종목 · 원금{' '}
              {hidden ? mask : Math.round(summary.invested).toLocaleString('ko-KR')}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                summary.unrealized >= 0 ? 'text-red-500' : 'text-blue-500'
              }`}
            >
              {hidden
                ? `${summary.unrealizedPct >= 0 ? '+' : ''}${summary.unrealizedPct.toFixed(2)}%`
                : `${summary.unrealized >= 0 ? '+' : ''}${Math.round(summary.unrealized).toLocaleString('ko-KR')} (${summary.unrealizedPct >= 0 ? '+' : ''}${summary.unrealizedPct.toFixed(2)}%)`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
