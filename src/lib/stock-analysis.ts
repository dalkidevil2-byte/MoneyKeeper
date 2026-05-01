/**
 * 거래 패턴 분석 헬퍼.
 * - 평균 보유 기간
 * - 단타 (< 7일) vs 장투 (>= 30일) 비교
 * - 종목별 누적 손익
 * - 매수/매도 빈도
 */

import dayjs from 'dayjs';
import { computeRealizedTrades, type StockTx } from './stock-holdings';

export type TradeAnalysis = {
  total_trades: number;
  realized_pl_total: number;
  win_rate: number; // 0~100
  avg_hold_days: number;
  short_term: { count: number; pl: number; win_rate: number };
  long_term: { count: number; pl: number; win_rate: number };
  best_ticker: { ticker: string; companyName: string; pl: number } | null;
  worst_ticker: { ticker: string; companyName: string; pl: number } | null;
  recent_trades: Array<{
    date: string;
    ticker: string;
    companyName: string;
    pl: number;
    plPct: number;
    hold_days: number;
  }>;
};

/**
 * 거래(매도) 기준 분석. 매수만 한 종목은 미실현이라 별도.
 */
export function analyzeTrades(txs: StockTx[]): TradeAnalysis {
  const realized = computeRealizedTrades(txs);

  // 평균 보유일 계산: 매도 시점에서 가장 오래된 매수까지의 거리
  const sortedTxs = [...txs].sort((a, b) => a.date.localeCompare(b.date));
  const buyDatesByKey = new Map<string, string[]>();
  for (const t of sortedTxs) {
    if (t.type !== 'BUY') continue;
    const k = `${t.account_id}-${t.ticker}`;
    if (!buyDatesByKey.has(k)) buyDatesByKey.set(k, []);
    buyDatesByKey.get(k)!.push(t.date);
  }

  const trades = realized.map((r) => {
    const k = `${r.accountId}-${r.ticker}`;
    const buys = buyDatesByKey.get(k) ?? [];
    const earliestBuy = buys.find((d) => d <= r.date) ?? buys[0] ?? r.date;
    const holdDays = dayjs(r.date).diff(dayjs(earliestBuy), 'day');
    return { ...r, hold_days: holdDays };
  });

  const totalPL = trades.reduce((s, t) => s + t.pl, 0);
  const winning = trades.filter((t) => t.pl > 0).length;
  const winRate = trades.length > 0 ? (winning / trades.length) * 100 : 0;

  const shortTerm = trades.filter((t) => t.hold_days < 7);
  const longTerm = trades.filter((t) => t.hold_days >= 30);

  const byTicker = new Map<string, { ticker: string; companyName: string; pl: number }>();
  for (const t of trades) {
    const cur = byTicker.get(t.ticker);
    if (cur) cur.pl += t.pl;
    else byTicker.set(t.ticker, { ticker: t.ticker, companyName: t.companyName, pl: t.pl });
  }
  const tickerList = Array.from(byTicker.values()).sort((a, b) => b.pl - a.pl);

  const avgHoldDays =
    trades.length > 0
      ? Math.round(trades.reduce((s, t) => s + t.hold_days, 0) / trades.length)
      : 0;

  const fmtPart = (arr: typeof trades) => ({
    count: arr.length,
    pl: arr.reduce((s, t) => s + t.pl, 0),
    win_rate:
      arr.length > 0
        ? (arr.filter((t) => t.pl > 0).length / arr.length) * 100
        : 0,
  });

  return {
    total_trades: trades.length,
    realized_pl_total: Math.round(totalPL),
    win_rate: Math.round(winRate * 10) / 10,
    avg_hold_days: avgHoldDays,
    short_term: {
      count: shortTerm.length,
      pl: Math.round(fmtPart(shortTerm).pl),
      win_rate: Math.round(fmtPart(shortTerm).win_rate * 10) / 10,
    },
    long_term: {
      count: longTerm.length,
      pl: Math.round(fmtPart(longTerm).pl),
      win_rate: Math.round(fmtPart(longTerm).win_rate * 10) / 10,
    },
    best_ticker: tickerList[0] ?? null,
    worst_ticker: tickerList.length > 0 ? tickerList[tickerList.length - 1] : null,
    recent_trades: trades
      .slice(-10)
      .reverse()
      .map((t) => ({
        date: t.date,
        ticker: t.ticker,
        companyName: t.companyName,
        pl: Math.round(t.pl),
        plPct: Math.round(t.plPct * 10) / 10,
        hold_days: t.hold_days,
      })),
  };
}
