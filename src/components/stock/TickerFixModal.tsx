'use client';

import { useEffect, useState } from 'react';
import { X, Search } from 'lucide-react';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type KrxResult = { code: string; ticker: string; name: string; market: string };

interface Props {
  fromTicker: string;
  fromName?: string | null;
  onClose: () => void;
  onMoved: (newTicker: string) => void;
}

export default function TickerFixModal({ fromTicker, fromName, onClose, onMoved }: Props) {
  const [q, setQ] = useState(fromName ?? '');
  const [results, setResults] = useState<KrxResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/stocks/krx-search?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        setResults(Array.isArray(j) ? j : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const move = async (newTicker: string) => {
    setMoving(true);
    setError(null);
    try {
      const r = await fetch('/api/stocks/memos/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          from_ticker: fromTicker,
          to_ticker: newTicker,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '이동 실패');
      onMoved(newTicker);
    } catch (e) {
      setError(e instanceof Error ? e.message : '이동 실패');
    } finally {
      setMoving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">종목 매칭 수정</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-4 flex-shrink-0">
          <div className="text-xs text-gray-500 mb-2">
            현재 ticker: <span className="font-mono font-semibold text-gray-700">{fromTicker}</span>
            {fromName && <span className="ml-1 text-gray-400">({fromName})</span>}
          </div>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="종목명 / 코드 / 티커 검색"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:outline-none"
            />
          </div>
          {error && <div className="text-[11px] text-rose-500 mt-2">{error}</div>}
        </div>

        <div className="overflow-y-auto px-5 pb-6 flex-1">
          {searching && <div className="text-xs text-gray-400 py-4 text-center">검색 중…</div>}
          {!searching && q.trim() && results.length === 0 && (
            <div className="text-xs text-gray-400 py-4 text-center">결과 없음</div>
          )}
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.code}>
                <button
                  disabled={moving || r.ticker === fromTicker}
                  onClick={() => move(r.ticker)}
                  className="w-full text-left px-3 py-2 rounded-xl border border-gray-100 active:bg-gray-50 disabled:opacity-50"
                >
                  <div className="text-sm font-bold text-gray-900">{r.name}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {r.ticker} · {r.code} · {r.market}
                    {r.ticker === fromTicker && (
                      <span className="ml-2 text-gray-300">(현재)</span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
