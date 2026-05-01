'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, Trash2, Save, Edit3, X, Wand2 } from 'lucide-react';
import dayjs from 'dayjs';
import HoldingsCompare from '@/components/stock/HoldingsCompare';
import TickerFixModal from '@/components/stock/TickerFixModal';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type OwnerHolding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stocks/memos?household_id=${HOUSEHOLD_ID}&enrich=1`);
      const j = await res.json();
      const list: Memo[] = j.memos ?? [];
      const enriched: EnrichedMemo[] = list.map((m) => ({
        ...m,
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

  const filtered = useMemo(() => {
    if (!search.trim()) return memos;
    const q = search.toLowerCase();
    return memos.filter(
      (m) =>
        m.ticker.toLowerCase().includes(q) ||
        (m.name ?? '').toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q),
    );
  }, [memos, search]);

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
        {loading ? (
          <div className="text-center text-sm text-gray-400 py-12">불러오는 중…</div>
        ) : filtered.length === 0 ? (
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
          filtered.map((m) => (
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

              {/* 보유 비교 — 메모와 같이 보여줌 */}
              {editingTicker !== m.ticker && m.holdings && m.holdings.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-50">
                  <HoldingsCompare
                    holdings={m.holdings}
                    currentPrice={m.current_price ?? null}
                    currency={m.currency}
                  />
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
