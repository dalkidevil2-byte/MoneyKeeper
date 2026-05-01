'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Camera, Loader2, ChevronRight } from 'lucide-react';
import StockTransactionSheet, {
  type PrefillTx,
} from './StockTransactionSheet';

type ParsedTrade = {
  type?: 'BUY' | 'SELL';
  date?: string;
  ticker?: string;
  company_name?: string;
  quantity?: number;
  price?: number;
  fee?: number;
  tax?: number;
  broker_hint?: string;
};

type AccountInfo = { id: string; broker_name: string; owner_id: string };

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function StockImportFromImage({ onClose, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trades, setTrades] = useState<ParsedTrade[]>([]);
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ trade: ParsedTrade } | null>(null);
  const [savedIdx, setSavedIdx] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 클립보드에서 paste 지원
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (busy || trades.length > 0) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            void uploadFile(f);
            break;
          }
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, trades.length]);

  const uploadFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/stocks/transactions/ocr', {
        method: 'POST',
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const list = (j.trades ?? []) as ParsedTrade[];
      setTrades(list);
      setAccounts((j.accounts ?? []) as AccountInfo[]);
      if (list.length === 0) {
        setError('거래 정보를 찾지 못했어요. 더 선명한 캡쳐를 시도해주세요.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void uploadFile(f);
  };

  const reset = () => {
    setTrades([]);
    setAccounts([]);
    setError(null);
    setPreviewUrl(null);
    setSavedIdx(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const guessAccountId = (broker?: string): string | undefined => {
    if (!broker || accounts.length === 0) return accounts[0]?.id;
    const lower = broker.toLowerCase();
    const match = accounts.find((a) =>
      a.broker_name.toLowerCase().includes(lower) ||
      lower.includes(a.broker_name.toLowerCase()),
    );
    return (match ?? accounts[0])?.id;
  };

  // 시트에서 저장된 후 호출
  const onTradeSaved = (idx: number) => {
    setSavedIdx((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
    onSaved(); // 부모 리스트 새로고침
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900 inline-flex items-center gap-2">
            <Camera size={18} className="text-indigo-600" /> 거래 캡쳐로 등록
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-3">
          {trades.length === 0 && !busy && (
            <>
              <p className="text-xs text-gray-500 leading-relaxed">
                증권사 앱에서 체결확인/거래내역 화면을 캡쳐하거나,
                클립보드에서 그대로 붙여넣으세요 (Ctrl+V).
                AI 가 종목 · 수량 · 단가 · 수수료 · 세금을 추출하면 한 번 더 검토 후 저장돼요.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-700 text-sm font-semibold active:bg-indigo-100"
              >
                📷 이미지 선택 또는 붙여넣기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
              />
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-xs">
                  {error}
                </div>
              )}
            </>
          )}

          {busy && (
            <div className="py-8 flex flex-col items-center gap-2 text-sm text-gray-500">
              <Loader2 size={28} className="animate-spin text-indigo-600" />
              AI 가 캡쳐 분석 중…
            </div>
          )}

          {trades.length > 0 && (
            <>
              {previewUrl && (
                <div className="rounded-xl overflow-hidden border border-gray-100 max-h-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previewUrl} alt="capture" className="w-full object-cover max-h-40" />
                </div>
              )}
              <div className="text-xs text-gray-500">
                {trades.length}건 인식됨. 각 항목을 눌러 검토 후 저장하세요.
              </div>
              {trades.map((t, i) => {
                const saved = savedIdx.has(i);
                return (
                  <button
                    key={i}
                    disabled={saved}
                    onClick={() => setEditing({ trade: t })}
                    className={`w-full text-left rounded-2xl border p-3 active:bg-gray-50 ${
                      saved ? 'bg-green-50 border-green-200 opacity-60' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          t.type === 'SELL'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {t.type === 'SELL' ? '매도' : '매수'}
                      </span>
                      <span className="text-[11px] text-gray-400">{t.date}</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900">
                      {t.company_name || t.ticker || '?'}
                      <span className="text-xs text-gray-400 font-normal ml-1">
                        {t.ticker}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {t.quantity}주 × {t.price?.toLocaleString('ko-KR')}원
                      {t.fee && t.fee > 0 ? ` · 수수료 ${t.fee.toLocaleString('ko-KR')}` : ''}
                      {t.tax && t.tax > 0 ? ` · 세금 ${t.tax.toLocaleString('ko-KR')}` : ''}
                    </div>
                    <div className="flex items-center justify-end mt-1 text-xs">
                      {saved ? (
                        <span className="text-green-600 font-semibold">✓ 저장됨</span>
                      ) : (
                        <span className="text-indigo-600 inline-flex items-center gap-0.5 font-semibold">
                          검토 후 저장 <ChevronRight size={12} />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              <button
                onClick={reset}
                className="w-full py-2 rounded-xl border border-gray-200 text-gray-500 text-xs font-semibold"
              >
                다른 이미지 선택
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <StockTransactionSheet
          mode="create"
          prefill={{
            account_id: guessAccountId(editing.trade.broker_hint),
            ticker: editing.trade.ticker,
            company_name: editing.trade.company_name,
            type: editing.trade.type,
            date: editing.trade.date,
            quantity: editing.trade.quantity,
            price: editing.trade.price,
            fee: editing.trade.fee,
            tax: editing.trade.tax,
          }}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const idx = trades.indexOf(editing.trade);
            setEditing(null);
            if (idx >= 0) onTradeSaved(idx);
          }}
        />
      )}
    </div>
  );
}
