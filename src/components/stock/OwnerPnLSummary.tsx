'use client';

type Holding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
};

type Realized = {
  owner_id: string;
  owner_name: string;
  total_pl: number;
  total_qty: number;
  trade_count: number;
};

interface Props {
  holdings: Holding[];
  realized: Realized[];
  currentPrice: number | null;
  currency?: string | null;
}

type Row = {
  owner_id: string;
  owner_name: string;
  invested: number;
  unrealized: number;
  realized: number;
  total: number;
  totalCost: number;   // 평가 비율 계산용 (실현 cost + 미실현 cost)
};

/**
 * 보유자별 종합 손익 평가:
 * - 실현 손익 (매도 완료분)
 * - 미실현 손익 (현재 보유분)
 * - 합계
 *
 * "이 종목으로 X 가 얼마 벌었나/잃었나" 한눈에 보기.
 */
export default function OwnerPnLSummary({ holdings, realized, currentPrice, currency }: Props) {
  const fmt = (n: number) => {
    if (currency === 'USD')
      return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    return `${Math.round(n).toLocaleString('ko-KR')}원`;
  };
  const sign = (n: number) => (n >= 0 ? '+' : '');

  // 모든 owner_id 합치기
  const ownerIds = new Set<string>();
  for (const h of holdings) ownerIds.add(h.owner_id);
  for (const r of realized) ownerIds.add(r.owner_id);
  if (ownerIds.size === 0) return null;

  const rows: Row[] = [];
  for (const oid of ownerIds) {
    const h = holdings.find((x) => x.owner_id === oid);
    const r = realized.find((x) => x.owner_id === oid);
    const name = h?.owner_name ?? r?.owner_name ?? '?';
    const invested = h?.invested ?? 0;
    const value = h && currentPrice != null ? h.qty * currentPrice : null;
    const unrealized = value != null ? value - invested : null;
    const real = r?.total_pl ?? 0;
    rows.push({
      owner_id: oid,
      owner_name: name,
      invested,
      unrealized: unrealized ?? 0,
      realized: real,
      total: (unrealized ?? 0) + real,
      // 비율 계산용 cost basis: 미실현 invested + 실현된 거래의 비용 추정
      // realized total_pl 만 알고 cost 는 따로 안 보이지만, 비교 단순화 위해 invested + |realized total_pl 비율 가중치| 대신
      // 실현분 cost 는 알 수 없으니 invested 만으로는 부정확 → totalCost 는 단순 invested + realized_qty*평균과 비슷한 추정 생략, 그냥 invested 사용
      totalCost: invested,
    });
  }

  // 손익 큰 순 정렬
  rows.sort((a, b) => b.total - a.total);

  const totalInvested = rows.reduce((s, r) => s + r.invested, 0);
  const totalUnrealized = rows.reduce((s, r) => s + r.unrealized, 0);
  const totalRealized = rows.reduce((s, r) => s + r.realized, 0);
  const totalAll = totalUnrealized + totalRealized;

  return (
    <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-amber-900">
          💰 누적 손익 (보유자별)
        </span>
        <span
          className={`text-xs font-bold ${
            totalAll >= 0 ? 'text-rose-500' : 'text-blue-500'
          }`}
        >
          {sign(totalAll)}
          {fmt(totalAll)}
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const profit = r.total >= 0;
          return (
            <div
              key={r.owner_id}
              className="bg-white/70 rounded-lg px-2.5 py-1.5"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-bold text-gray-800 truncate">
                  {r.owner_name}
                </span>
                <span
                  className={`text-xs font-bold ${
                    profit ? 'text-rose-500' : 'text-blue-500'
                  }`}
                >
                  {sign(r.total)}
                  {fmt(r.total)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>
                  {r.invested > 0 && <>투자 {fmt(r.invested)}</>}
                </span>
                <span className="space-x-2">
                  {r.unrealized !== 0 && (
                    <span>
                      미실현{' '}
                      <span
                        className={
                          r.unrealized >= 0 ? 'text-rose-500' : 'text-blue-500'
                        }
                      >
                        {sign(r.unrealized)}
                        {fmt(r.unrealized)}
                      </span>
                    </span>
                  )}
                  {r.realized !== 0 && (
                    <span>
                      실현{' '}
                      <span
                        className={
                          r.realized >= 0 ? 'text-rose-500' : 'text-blue-500'
                        }
                      >
                        {sign(r.realized)}
                        {fmt(r.realized)}
                      </span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 합계 (2명 이상일 때) */}
      {rows.length > 1 && (
        <div className="flex items-center justify-between pt-1.5 border-t border-amber-200 px-1">
          <span className="text-[11px] font-bold text-amber-900">합계</span>
          <div className="text-right text-[10px] space-x-2">
            {totalInvested > 0 && (
              <span className="text-gray-600">투자 {fmt(totalInvested)}</span>
            )}
            {totalUnrealized !== 0 && (
              <span className="text-gray-600">
                미실현{' '}
                <span
                  className={
                    totalUnrealized >= 0 ? 'text-rose-500' : 'text-blue-500'
                  }
                >
                  {sign(totalUnrealized)}
                  {fmt(totalUnrealized)}
                </span>
              </span>
            )}
            {totalRealized !== 0 && (
              <span className="text-gray-600">
                실현{' '}
                <span
                  className={
                    totalRealized >= 0 ? 'text-rose-500' : 'text-blue-500'
                  }
                >
                  {sign(totalRealized)}
                  {fmt(totalRealized)}
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
