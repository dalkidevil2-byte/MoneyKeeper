'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, Trash2, Save, Edit3, X, Wand2 } from 'lucide-react';
import dayjs from 'dayjs';
import HoldingsCompare from '@/components/stock/HoldingsCompare';
import OwnerPnLSummary from '@/components/stock/OwnerPnLSummary';
import TradeHistoryCompact from '@/components/stock/TradeHistoryCompact';
import TickerFixModal from '@/components/stock/TickerFixModal';
import MemoAnalyticsPanel from '@/components/stock/MemoAnalyticsPanel';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type OwnerHolding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
};

type Trade = {
  id: string;
  date: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  owner_id: string;
  owner_name: string;
};

type Realized = {
  owner_id: string;
  owner_name: string;
  total_pl: number;
  total_qty: number;
  trade_count: number;
};

type Memo = {
  id: string;
  ticker: string;
  content: string;
  updated_at: string;
  name?: string | null;
  current_price?: number | null;
  currency?: string | null;
  holdings?: OwnerHolding[];
  realized?: Realized[];
  trades?: Trade[];
  has_history?: boolean;
};

type Block = {
  raw: string;       // 편집할 때 쓸 원문 블록 전체
  date: string | null;
  tag: string | null;
  source: string | null;
  body: string;
};

type EnrichedMemo = Memo & {
  blocks: Block[];
};

function parseBlocks(content: string): Block[] {
  const sections = content.split(/\n\s*---\s*\n/);
  const out: Block[] = [];
  for (const sec of sections) {
    const trimmed = sec.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.*?)\n([\s\S]*)$/);
    if (m) {
      const [, date, header, body] = m;
      const sourceMatch = header.match(/·\s*(.+)$/);
      const tag = header.replace(/·\s*.+$/, '').trim() || null;
      out.push({
        raw: trimmed,
        date,
        tag,
        source: sourceMatch ? sourceMatch[1].trim() : null,
        body: body.trim(),
      });
    } else {
      out.push({ raw: trimmed, date: null, tag: null, source: null, body: trimmed });
    }
  }
  return out;
}

export default function StockMemosPage() {
  const [memos, setMemos] = useState<EnrichedMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [fixingTicker, setFixingTicker] = useState<{ ticker: string; name?: string | null } | null>(null);

  // 필터
  const [ownerFilter, setOwnerFilter] = useState<string>(''); // '' = 전체
  const [statusFilter, setStatusFilter] = useState<'all' | 'held' | 'sold' | 'memo_only'>('all');
  const [recoFilter, setRecoFilter] = useState<'all' | 'buy' | 'sell' | 'watch' | 'hold'>('all');
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [sortBy, setSortBy] = useState<'default' | 'updated' | 'value' | 'invested' | 'pl'>('default');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/memos?household_id=${HOUSEHOLD_ID}&enrich=1`);
      const j = await res.json();
      const list: Memo[] = j.memos ?? [];

      // 시세 클라이언트에서 일괄 조회
      const tickers = Array.from(new Set(list.map((m) => m.ticker).filter(Boolean)));
      const priceMap: Record<string, { price: number; currency?: string }> = {};
      if (tickers.length > 0) {
        try {
          const qRes = await fetch(
            `/api/stocks/quote?symbols=${encodeURIComponent(tickers.join(','))}`,
          );
          if (qRes.ok) {
            const qJ = await qRes.json();
            const results = qJ?.quoteResponse?.result ?? [];
            for (const r of results) {
              if (r.symbol && typeof r.regularMarketPrice === 'number') {
                priceMap[r.symbol] = {
                  price: r.regularMarketPrice,
                  currency: r.currency,
                };
              }
            }
          }
        } catch {
          /* 시세 실패해도 메모는 표시 */
        }
      }

      const enriched: EnrichedMemo[] = list.map((m) => ({
        ...m,
        current_price: priceMap[m.ticker]?.price ?? null,
        currency: priceMap[m.ticker]?.currency ?? null,
        blocks: parseBlocks(m.content ?? ''),
      }));

      setMemos(enriched);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 메모에 등장한 모든 owner 목록
  const ownerList = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of memos) {
      for (const h of m.holdings ?? []) map.set(h.owner_id, h.owner_name);
      for (const r of m.realized ?? []) map.set(r.owner_id, r.owner_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [memos]);

  const filtered = useMemo(() => {
    let list = memos;

    // 검색
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.ticker.toLowerCase().includes(q) ||
          (m.name ?? '').toLowerCase().includes(q) ||
          m.content.toLowerCase().includes(q),
      );
    }

    // 보유자 필터
    if (ownerFilter) {
      list = list.filter((m) => {
        const inHoldings = (m.holdings ?? []).some((h) => h.owner_id === ownerFilter);
        const inRealized = (m.realized ?? []).some((r) => r.owner_id === ownerFilter);
        return inHoldings || inRealized;
      });
    }

    // 상태 필터
    if (statusFilter !== 'all') {
      list = list.filter((m) => {
        const held = (m.holdings?.length ?? 0) > 0;
        const traded = !held && m.has_history;
        if (statusFilter === 'held') return held;
        if (statusFilter === 'sold') return traded;
        if (statusFilter === 'memo_only') return !held && !m.has_history;
        return true;
      });
    }

    // 추천 상태 필터 — 최신 블록의 tag 기준
    if (recoFilter !== 'all') {
      const matches: Record<'buy' | 'sell' | 'watch' | 'hold', RegExp> = {
        buy: /매수/,
        sell: /매도/,
        watch: /관심|주목/,
        hold: /유지|홀드/,
      };
      const re = matches[recoFilter];
      list = list.filter((m) => re.test(m.blocks?.[0]?.tag ?? ''));
    }

    return list;
  }, [memos, search, ownerFilter, statusFilter, recoFilter]);

  // 보유자 필터가 켜져있으면 분석 패널/표시도 해당 owner 만 합산하도록 메모 데이터 가공
  const filteredForStats = useMemo(() => {
    if (!ownerFilter) return filtered;
    return filtered.map((m) => ({
      ...m,
      holdings: (m.holdings ?? []).filter((h) => h.owner_id === ownerFilter),
      realized: (m.realized ?? []).filter((r) => r.owner_id === ownerFilter),
      trades: (m.trades ?? []).filter((t) => t.owner_id === ownerFilter),
    }));
  }, [filtered, ownerFilter]);

  // 헬퍼들
  const valueOf = (m: EnrichedMemo): number =>
    (m.holdings ?? []).reduce(
      (s, h) => s + h.qty * (m.current_price ?? h.avgPrice),
      0,
    );
  const investedOf = (m: EnrichedMemo): number =>
    (m.holdings ?? []).reduce((s, h) => s + h.invested, 0);
  const totalPLOf = (m: EnrichedMemo): number => {
    const realized = (m.realized ?? []).reduce((s, r) => s + r.total_pl, 0);
    let unrealized = 0;
    if (m.current_price != null) {
      for (const h of m.holdings ?? []) {
        unrealized += h.qty * m.current_price - h.invested;
      }
    }
    return realized + unrealized;
  };

  const tier = (m: EnrichedMemo): number => {
    if ((m.holdings?.length ?? 0) > 0) return 0;
    if (m.has_history) return 1;
    return 2;
  };

  const sorted = useMemo(() => {
    const arr = filteredForStats.slice();
    if (sortBy === 'updated') {
      arr.sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
      );
    } else if (sortBy === 'value') {
      arr.sort((a, b) => valueOf(b) - valueOf(a));
    } else if (sortBy === 'invested') {
      arr.sort((a, b) => investedOf(b) - investedOf(a));
    } else if (sortBy === 'pl') {
      arr.sort((a, b) => totalPLOf(b) - totalPLOf(a));
    } else {
      // default: 보유 → 매도 → 메모만, 그 안에서 평가액 / 최근 거래 / updated_at
      arr.sort((a, b) => {
        const ta = tier(a);
        const tb = tier(b);
        if (ta !== tb) return ta - tb;
        if (ta === 0) {
          const av = valueOf(a);
          const bv = valueOf(b);
          if (av !== bv) return bv - av;
        }
        if (ta === 1) {
          const aLast = a.trades?.[0]?.date ?? '';
          const bLast = b.trades?.[0]?.date ?? '';
          if (aLast !== bLast) return bLast.localeCompare(aLast);
        }
        return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
      });
    }
    return arr;
  }, [filteredForStats, sortBy]);

  const startEdit = (m: EnrichedMemo) => {
    setEditingTicker(m.ticker);
    setEditText(m.content);
  };

  const saveEdit = async () => {
    if (!editingTicker) return;
    setSaving(true);
    try {
      await fetch('/api/stocks/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          ticker: editingTicker,
          content: editText,
        }),
      });
      setEditingTicker(null);
      setEditText('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const deleteMemo = async (m: EnrichedMemo) => {
    if (!confirm(`${m.name ?? m.ticker} 메모를 모두 삭제할까요?`)) return;
    await fetch('/api/stocks/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        ticker: m.ticker,
        content: '',
      }),
    });
    load();
  };

  const deleteBlock = async (m: EnrichedMemo, blockIdx: number) => {
    if (!confirm('이 메모 한 건만 삭제할까요?')) return;
    const remaining = m.blocks.filter((_, i) => i !== blockIdx).map((b) => b.raw);
    const merged = remaining.join('\n\n---\n\n');
    await fetch('/api/stocks/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        ticker: m.ticker,
        content: merged,
      }),
    });
    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/stocks" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">📌 종목 메모</h1>
        </div>
        <div className="max-w-lg mx-auto px-4 pb-3">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="종목명 / 티커 / 본문 검색"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-200"
            />
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 분석 패널 */}
        {!loading && memos.length > 0 && showAnalytics && (
          <MemoAnalyticsPanel memos={filteredForStats} />
        )}

        {/* 필터 / 정렬 */}
        {!loading && memos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-2">
            {/* 보유자 필터 */}
            {ownerList.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
                <span className="text-[10px] font-bold text-gray-400 shrink-0 mr-1">
                  보유자
                </span>
                <button
                  onClick={() => setOwnerFilter('')}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    !ownerFilter
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  전체
                </button>
                {ownerList.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setOwnerFilter(o.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                      ownerFilter === o.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            )}

            {/* 상태 필터 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
              <span className="text-[10px] font-bold text-gray-400 shrink-0 mr-1">
                상태
              </span>
              {([
                { v: 'all', label: '전체' },
                { v: 'held', label: '보유 중' },
                { v: 'sold', label: '매도 완료' },
                { v: 'memo_only', label: '메모만' },
              ] as const).map((s) => (
                <button
                  key={s.v}
                  onClick={() => setStatusFilter(s.v)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    statusFilter === s.v
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 최근 추천 톤 필터 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
              <span className="text-[10px] font-bold text-gray-400 shrink-0 mr-1">
                최근 추천
              </span>
              {([
                { v: 'all', label: '전체' },
                { v: 'buy', label: '🟢 매수추천' },
                { v: 'sell', label: '🔴 매도추천' },
                { v: 'watch', label: '👀 관심' },
                { v: 'hold', label: '⚪ 유지' },
              ] as const).map((s) => (
                <button
                  key={s.v}
                  onClick={() => setRecoFilter(s.v)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    recoFilter === s.v
                      ? 'bg-rose-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 정렬 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
              <span className="text-[10px] font-bold text-gray-400 shrink-0 mr-1">
                정렬
              </span>
              {([
                { v: 'default', label: '기본 (보유 우선)' },
                { v: 'updated', label: '최근 메모' },
                { v: 'value', label: '평가액' },
                { v: 'invested', label: '투자액' },
                { v: 'pl', label: '손익' },
              ] as const).map((s) => (
                <button
                  key={s.v}
                  onClick={() => setSortBy(s.v)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                    sortBy === s.v
                      ? 'bg-amber-500 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* 토글 */}
            <div className="flex items-center justify-between pt-1 border-t border-gray-50">
              <span className="text-[10px] text-gray-400">
                {sorted.length}/{memos.length}건 표시
              </span>
              <button
                onClick={() => setShowAnalytics((v) => !v)}
                className="text-[10px] text-violet-600 font-semibold"
              >
                {showAnalytics ? '분석 패널 숨기기' : '분석 패널 보이기'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-12">불러오는 중…</div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="text-4xl mb-3">📌</div>
            <p className="text-sm text-gray-500 leading-relaxed">
              저장된 종목 메모가 없어요.
              <br />
              AI 어시스턴트에 리딩방/뉴스/리포트 메시지를 그대로 붙여넣으면
              <br />
              종목별로 자동 누적돼요.
            </p>
            <Link
              href="/assistant"
              className="inline-block mt-4 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold"
            >
              AI 어시스턴트 열기
            </Link>
          </div>
        ) : (
          sorted.map((m) => (
            <div
              key={m.ticker}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
            >
              <div className="px-4 py-3 flex items-center justify-between border-b border-gray-50">
                <Link
                  href={`/stocks/chart?ticker=${encodeURIComponent(m.ticker)}`}
                  className="min-w-0 flex-1 active:opacity-60"
                >
                  <div className="text-sm font-bold text-gray-900 truncate hover:text-violet-700">
                    {m.name ?? m.ticker}
                    <span className="text-[11px] text-gray-300 font-normal ml-1.5">↗</span>
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {m.ticker} · {m.blocks.length}건 · 최근{' '}
                    {dayjs(m.updated_at).format('M월 D일')}
                  </div>
                </Link>
                {editingTicker === m.ticker ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="p-2 rounded-lg text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                      title="저장"
                    >
                      <Save size={16} />
                    </button>
                    <button
                      onClick={() => {
                        setEditingTicker(null);
                        setEditText('');
                      }}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                      title="취소"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setFixingTicker({ ticker: m.ticker, name: m.name })}
                      className="p-2 rounded-lg text-amber-600 hover:bg-amber-50"
                      title="종목 매칭 수정"
                    >
                      <Wand2 size={15} />
                    </button>
                    <button
                      onClick={() => startEdit(m)}
                      className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                      title="편집"
                    >
                      <Edit3 size={15} />
                    </button>
                    <button
                      onClick={() => deleteMemo(m)}
                      className="p-2 rounded-lg text-rose-500 hover:bg-rose-50"
                      title="전체 삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>

              {/* 보유 + 누적손익 + 거래내역 */}
              {editingTicker !== m.ticker &&
                ((m.holdings && m.holdings.length > 0) ||
                  m.current_price != null ||
                  (m.trades && m.trades.length > 0)) && (
                  <div className="px-4 py-3 border-b border-gray-50 space-y-2">
                    {((m.holdings && m.holdings.length > 0) || m.current_price != null) && (
                      <HoldingsCompare
                        holdings={m.holdings ?? []}
                        currentPrice={m.current_price ?? null}
                        currency={m.currency ?? null}
                      />
                    )}
                    {/* 누적 손익 — 거래 이력이 있을 때 */}
                    {m.trades && m.trades.length > 0 && (
                      <OwnerPnLSummary
                        holdings={m.holdings ?? []}
                        realized={m.realized ?? []}
                        currentPrice={m.current_price ?? null}
                        currency={m.currency ?? null}
                      />
                    )}
                    {m.trades && m.trades.length > 0 && (
                      <TradeHistoryCompact
                        trades={m.trades}
                        realized={m.realized ?? []}
                        currency={m.currency ?? null}
                        initialCollapsed={(m.holdings?.length ?? 0) > 0}
                      />
                    )}
                  </div>
                )}

              {editingTicker === m.ticker ? (
                <div className="p-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={Math.min(20, Math.max(6, editText.split('\n').length + 1))}
                    className="w-full text-sm font-mono px-3 py-2 rounded-xl border border-gray-200 focus:border-violet-400 focus:outline-none resize-y"
                    placeholder="메모 내용. 날짜별 블록은 빈 줄 + --- + 빈 줄 로 구분."
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    형식: <code>[YYYY-MM-DD] 🟢 매수추천 · 출처</code> 후 줄바꿈해서 본문.
                    블록 사이는 빈 줄과 <code>---</code> 으로 구분.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {m.blocks.map((b, i) => (
                    <li key={i} className="px-4 py-3 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-gray-500 mb-1 inline-flex items-center gap-1.5 flex-wrap">
                          {b.date && (
                            <span className="font-semibold text-gray-700">
                              {b.date}
                            </span>
                          )}
                          {b.tag && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {b.tag}
                            </span>
                          )}
                          {b.source && (
                            <span className="text-gray-400">· {b.source}</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                          {b.body}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteBlock(m, i)}
                        className="p-1.5 rounded text-gray-300 hover:text-rose-500 hover:bg-rose-50 shrink-0"
                        title="이 메모만 삭제"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      {fixingTicker && (
        <TickerFixModal
          fromTicker={fixingTicker.ticker}
          fromName={fixingTicker.name}
          onClose={() => setFixingTicker(null)}
          onMoved={() => {
            setFixingTicker(null);
            load();
          }}
        />
      )}
    </div>
  );
}
