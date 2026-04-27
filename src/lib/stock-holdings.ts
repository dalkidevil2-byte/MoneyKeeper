/**
 * 거래내역 → 보유 종목 계산 (StockWeb 이관 로직).
 * - BUY: 가중평균가 = (기존 qty × 기존 avg + 매수 qty × 매수가) / 전체 qty
 * - SELL: 평단가 유지, qty만 감소. 전량 매도 시 평단가 0 리셋.
 */

export type StockTx = {
  id: string;
  account_id: string;
  ticker: string;
  company_name: string;
  type: 'BUY' | 'SELL';
  date: string;          // YYYY-MM-DD
  quantity: number;
  price: number;
  created_at: string;    // ISO
};

export type Holding = {
  accountId: string;
  ticker: string;
  companyName: string;
  qty: number;
  avgPrice: number;
};

/** 계좌별 + 종목별 보유 집계 */
export function computeHoldings(txs: StockTx[], accountId?: string): Holding[] {
  const filtered = accountId ? txs.filter((t) => t.account_id === accountId) : txs;
  const sorted = filtered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

  const map: Record<string, Holding> = {};

  for (const tx of sorted) {
    const key = `${tx.account_id}-${tx.ticker}`;
    if (!map[key]) {
      map[key] = {
        accountId: tx.account_id,
        ticker: tx.ticker,
        companyName: tx.company_name,
        qty: 0,
        avgPrice: 0,
      };
    }
    const h = map[key];

    if (tx.type === 'BUY') {
      const newQty = h.qty + tx.quantity;
      h.avgPrice = newQty > 0 ? (h.qty * h.avgPrice + tx.quantity * tx.price) / newQty : 0;
      h.qty = newQty;
      if (tx.company_name) h.companyName = tx.company_name;
    } else {
      h.qty = Math.max(0, h.qty - tx.quantity);
      if (h.qty === 0) h.avgPrice = 0;
    }
  }

  return Object.values(map).filter((h) => h.qty > 0.00001);
}

/** 종목별 집계 (모든 계좌 합산) */
export type AggregatedHolding = {
  ticker: string;
  companyName: string;
  qty: number;
  avgPrice: number;        // 가중 평균
  invested: number;        // qty * avgPrice
};

export function aggregateByTicker(holdings: Holding[]): AggregatedHolding[] {
  const map: Record<string, { ticker: string; companyName: string; qty: number; invested: number }> = {};

  for (const h of holdings) {
    const key = h.ticker;
    if (!map[key]) {
      map[key] = { ticker: h.ticker, companyName: h.companyName, qty: 0, invested: 0 };
    }
    map[key].qty += h.qty;
    map[key].invested += h.qty * h.avgPrice;
    if (h.companyName) map[key].companyName = h.companyName;
  }

  return Object.values(map).map((m) => ({
    ticker: m.ticker,
    companyName: m.companyName,
    qty: m.qty,
    invested: m.invested,
    avgPrice: m.qty > 0 ? m.invested / m.qty : 0,
  }));
}

/** 매도 거래 1건당 실현손익을 산출한 상세 리스트 */
export type RealizedTrade = {
  txId: string;
  date: string;          // YYYY-MM-DD
  accountId: string;
  ticker: string;
  companyName: string;
  quantity: number;      // 매도 수량
  sellPrice: number;
  avgCostAtSell: number; // 매도 시점의 평단가
  proceeds: number;      // = quantity * sellPrice
  cost: number;          // = quantity * avgCostAtSell
  pl: number;            // proceeds - cost
  plPct: number;         // pl / cost * 100
};

export function computeRealizedTrades(txs: StockTx[], accountId?: string): RealizedTrade[] {
  const filtered = accountId ? txs.filter((t) => t.account_id === accountId) : txs;
  const sorted = filtered
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));

  const cb: Record<string, { qty: number; avgPrice: number }> = {};
  const result: RealizedTrade[] = [];

  for (const tx of sorted) {
    const key = `${tx.account_id}-${tx.ticker}`;
    if (!cb[key]) cb[key] = { qty: 0, avgPrice: 0 };
    const h = cb[key];

    if (tx.type === 'BUY') {
      const newQty = h.qty + tx.quantity;
      h.avgPrice = newQty > 0 ? (h.qty * h.avgPrice + tx.quantity * tx.price) / newQty : 0;
      h.qty = newQty;
    } else {
      const sellQty = Math.min(tx.quantity, h.qty);
      if (sellQty > 0) {
        const proceeds = sellQty * tx.price;
        const cost = sellQty * h.avgPrice;
        const pl = proceeds - cost;
        result.push({
          txId: tx.id,
          date: tx.date,
          accountId: tx.account_id,
          ticker: tx.ticker,
          companyName: tx.company_name,
          quantity: sellQty,
          sellPrice: tx.price,
          avgCostAtSell: h.avgPrice,
          proceeds,
          cost,
          pl,
          plPct: cost > 0 ? (pl / cost) * 100 : 0,
        });
      }
      h.qty = Math.max(0, h.qty - tx.quantity);
      if (h.qty === 0) h.avgPrice = 0;
    }
  }
  return result;
}

/** 종목별 실현손익 합계 */
export type RealizedByTicker = {
  ticker: string;
  companyName: string;
  trades: number;
  totalQty: number;
  totalPL: number;
};

export function aggregateRealizedByTicker(trades: RealizedTrade[]): RealizedByTicker[] {
  const map: Record<string, RealizedByTicker> = {};
  for (const t of trades) {
    const k = t.ticker;
    if (!map[k]) {
      map[k] = { ticker: k, companyName: t.companyName, trades: 0, totalQty: 0, totalPL: 0 };
    }
    map[k].trades += 1;
    map[k].totalQty += t.quantity;
    map[k].totalPL += t.pl;
    if (t.companyName) map[k].companyName = t.companyName;
  }
  return Object.values(map).sort((a, b) => b.totalPL - a.totalPL);
}

/** 월별 실현손익 합계 (캘린더용 일별 + 월별) */
export type DailyPL = { date: string; pl: number; trades: number };
export type MonthlyPL = { yearMonth: string; pl: number; trades: number };

export function aggregateRealizedByDate(trades: RealizedTrade[]): Map<string, DailyPL> {
  const map = new Map<string, DailyPL>();
  for (const t of trades) {
    const cur = map.get(t.date) ?? { date: t.date, pl: 0, trades: 0 };
    cur.pl += t.pl;
    cur.trades += 1;
    map.set(t.date, cur);
  }
  return map;
}

export function aggregateRealizedByMonth(trades: RealizedTrade[]): MonthlyPL[] {
  const map = new Map<string, MonthlyPL>();
  for (const t of trades) {
    const ym = t.date.slice(0, 7);
    const cur = map.get(ym) ?? { yearMonth: ym, pl: 0, trades: 0 };
    cur.pl += t.pl;
    cur.trades += 1;
    map.set(ym, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
}

/** 소유자별 통계 (실현/미실현/원금/평가액) */
export type OwnerStat = {
  ownerId: string;
  ownerName: string;
  accountIds: string[];
  invested: number;
  current: number;
  unrealized: number;
  realized: number;
  holdingsCount: number;
};

export function computeOwnerStats(
  txs: StockTx[],
  owners: Array<{ id: string; name: string }>,
  accounts: Array<{ id: string; owner_id: string }>,
  prices: Record<string, number>
): OwnerStat[] {
  return owners.map((o) => {
    const accIds = accounts.filter((a) => a.owner_id === o.id).map((a) => a.id);
    const ownerTxs = txs.filter((t) => accIds.includes(t.account_id));
    const holdings = computeHoldings(ownerTxs);
    const realized = computeRealizedTrades(ownerTxs).reduce((s, t) => s + t.pl, 0);

    let invested = 0;
    let current = 0;
    for (const h of holdings) {
      invested += h.qty * h.avgPrice;
      current += h.qty * (prices[h.ticker] ?? h.avgPrice);
    }
    return {
      ownerId: o.id,
      ownerName: o.name,
      accountIds: accIds,
      invested,
      current,
      unrealized: current - invested,
      realized,
      holdingsCount: aggregateByTicker(holdings).length,
    };
  });
}

/** 실현손익 누계 (단순 합계) */
export type CashFlow = {
  id: string;
  account_id: string;
  date: string;
  type: 'DEPOSIT' | 'WITHDRAW';
  amount: number;
};

/**
 * 계좌별 현금 잔고 = 입금 합 - 출금 합 - 매수 대금 + 매도 대금
 * accountId 미지정 시 모든 계좌 합산.
 */
export function computeCashBalance(
  txs: StockTx[],
  flows: CashFlow[],
  accountId?: string,
): number {
  const ftxs = accountId ? txs.filter((t) => t.account_id === accountId) : txs;
  const fflows = accountId ? flows.filter((f) => f.account_id === accountId) : flows;
  let bal = 0;
  for (const f of fflows) {
    bal += f.type === 'DEPOSIT' ? f.amount : -f.amount;
  }
  for (const t of ftxs) {
    if (t.type === 'BUY') bal -= t.quantity * t.price;
    else bal += t.quantity * t.price;
  }
  return bal;
}

/** 계좌 id → 현금잔고 맵 */
export function computeCashByAccount(
  txs: StockTx[],
  flows: CashFlow[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const f of flows) {
    if (!map[f.account_id]) map[f.account_id] = 0;
    map[f.account_id] += f.type === 'DEPOSIT' ? f.amount : -f.amount;
  }
  for (const t of txs) {
    if (!map[t.account_id]) map[t.account_id] = 0;
    map[t.account_id] += t.type === 'BUY' ? -t.quantity * t.price : t.quantity * t.price;
  }
  return map;
}

export function computeRealizedPL(txs: StockTx[], accountId?: string): number {
  return computeRealizedTrades(txs, accountId).reduce((s, t) => s + t.pl, 0);
}
