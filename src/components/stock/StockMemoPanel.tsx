'use client';

import { useCallback, useEffect, useState } from 'react';
import { Edit3, Save, Trash2, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';
import HoldingsCompare from './HoldingsCompare';
import TickerFixModal from './TickerFixModal';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type Block = {
  raw: string;
  date: string | null;
  tag: string | null;
  source: string | null;
  body: string;
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

type OwnerHolding = {
  owner_id: string;
  owner_name: string;
  qty: number;
  avgPrice: number;
  invested: number;
};

interface Props {
  ticker: string;
  /** 헤더(제목) 노출 여부 */
  showHeader?: boolean;
  /** 처음에 접힌 상태로 시작 */
  initialCollapsed?: boolean;
  /** ticker 변경 시 부모에 알림 (예: chart 페이지의 ticker 갱신) */
  onTickerChanged?: (newTicker: string) => void;
}

export default function StockMemoPanel({
  ticker,
  showHeader = true,
  initialCollapsed = false,
  onTickerChanged,
}: Props) {
  const [content, setContent] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<OwnerHolding[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [fixing, setFixing] = useState(false);

  const load = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/stocks/memos?household_id=${HOUSEHOLD_ID}&ticker=${encodeURIComponent(ticker)}&enrich=1`,
      );
      const j = await res.json();
      const memo = j.memos?.[0];
      const raw = (memo?.content as string) ?? '';
      setContent(raw);
      setBlocks(parseBlocks(raw));
      setName(memo?.name ?? null);
      setHoldings((memo?.holdings ?? []) as OwnerHolding[]);
      setCurrentPrice(memo?.current_price ?? null);
      setCurrency(memo?.currency ?? null);
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = () => {
    setEditing(true);
    setEditText(content);
  };
  const saveEdit = async () => {
    setSaving(true);
    try {
      await fetch('/api/stocks/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          ticker,
          content: editText,
        }),
      });
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };
  const deleteBlock = async (idx: number) => {
    if (!confirm('이 메모 한 건만 삭제할까요?')) return;
    const remaining = blocks.filter((_, i) => i !== idx).map((b) => b.raw);
    const merged = remaining.join('\n\n---\n\n');
    await fetch('/api/stocks/memos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        ticker,
        content: merged,
      }),
    });
    load();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="text-xs text-gray-400">메모 불러오는 중…</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {showHeader && (
        <div className="border-b border-gray-50 flex items-center">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex-1 px-4 py-3 flex items-center justify-between active:bg-gray-50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-bold text-gray-900 truncate">
                📌 메모 {name && <span className="font-normal text-gray-500">· {name}</span>}
              </span>
              <span className="text-[11px] text-gray-400 shrink-0">
                {blocks.length > 0 ? `${blocks.length}건` : '없음'}
              </span>
            </div>
            {collapsed ? (
              <ChevronDown size={16} className="text-gray-400" />
            ) : (
              <ChevronUp size={16} className="text-gray-400" />
            )}
          </button>
          {!collapsed && content && (
            <button
              onClick={() => setFixing(true)}
              className="p-2 mr-1 rounded-lg text-amber-600 hover:bg-amber-50"
              title="종목 매칭 수정"
            >
              <Wand2 size={14} />
            </button>
          )}
        </div>
      )}

      {/* 보유 정보 */}
      {!collapsed && holdings.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-50">
          <HoldingsCompare
            holdings={holdings}
            currentPrice={currentPrice}
            currency={currency}
          />
        </div>
      )}

      {!collapsed && (
        <div>
          {editing ? (
            <div className="p-3">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={Math.min(20, Math.max(6, editText.split('\n').length + 1))}
                className="w-full text-sm font-mono px-3 py-2 rounded-xl border border-gray-200 focus:border-violet-400 focus:outline-none resize-y"
                placeholder='형식: [YYYY-MM-DD] 🟢 매수추천 · 출처 (줄바꿈) 본문. 블록 사이는 빈줄+---+빈줄.'
              />
              <div className="flex justify-end gap-1 mt-2">
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-gray-600 border border-gray-200"
                >
                  취소
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs text-white bg-violet-600 inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Save size={12} /> 저장
                </button>
              </div>
            </div>
          ) : blocks.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-xs text-gray-400 leading-relaxed">
                저장된 메모가 없어요.
                <br />
                AI 어시스턴트에 리딩방/뉴스 메시지를 보내면 자동 누적돼요.
              </p>
              <button
                onClick={startEdit}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-violet-600"
              >
                <Edit3 size={12} /> 직접 작성
              </button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-50">
                {blocks.map((b, i) => (
                  <li key={i} className="px-4 py-3 flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] mb-1 inline-flex items-center gap-1.5 flex-wrap">
                        {b.date && (
                          <span className="font-semibold text-gray-700">{b.date}</span>
                        )}
                        {b.tag && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {b.tag}
                          </span>
                        )}
                        {b.source && <span className="text-gray-400">· {b.source}</span>}
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                        {b.body}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteBlock(i)}
                      className="p-1 rounded text-gray-300 hover:text-rose-500 shrink-0"
                      title="이 메모만 삭제"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="px-4 py-2 border-t border-gray-50 flex justify-end">
                <button
                  onClick={startEdit}
                  className="text-xs text-gray-500 inline-flex items-center gap-1"
                >
                  <Edit3 size={12} /> 전체 편집
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {fixing && (
        <TickerFixModal
          fromTicker={ticker}
          fromName={name}
          onClose={() => setFixing(false)}
          onMoved={(newTicker) => {
            setFixing(false);
            if (onTickerChanged) onTickerChanged(newTicker);
            else load();
          }}
        />
      )}
    </div>
  );
}
