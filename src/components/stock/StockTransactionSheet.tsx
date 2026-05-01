'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Search, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';

// ─── 타입 ──────────────────────────────────────────
export type StockAccount = {
  id: string;
  broker_name: string;
  account_number: string;
  owner_id: string;
  owner?: { id: string; name: string };
};

export type ExistingTx = {
  id: string;
  account_id: string;
  ticker: string;
  company_name: string;
  type: 'BUY' | 'SELL';
  date: string;
  quantity: number;
  price: number;
  fee?: number;
  tax?: number;
  memo: string;
};

// OCR 결과로 시트를 미리 채울 때 사용
export type PrefillTx = {
  account_id?: string;
  ticker?: string;
  company_name?: string;
  type?: 'BUY' | 'SELL';
  date?: string;
  quantity?: number;
  price?: number;
  fee?: number;
  tax?: number;
  memo?: string;
};

type KrxResult = { code: string; ticker: string; name: string; market: string };

interface Props {
  mode: 'create' | 'edit';
  tx?: ExistingTx;                // edit 모드에서 필요
  defaultAccountId?: string;      // create 모드에서 미리 선택
  prefill?: PrefillTx;            // create 모드에서 OCR 결과 미리채움
  apiBase?: '/api/stocks' | '/api/stocks/paper'; // default: '/api/stocks'
  onClose: () => void;
  onSaved: () => void;
}

export default function StockTransactionSheet({
  mode,
  tx,
  defaultAccountId,
  prefill,
  apiBase = '/api/stocks',
  onClose,
  onSaved,
}: Props) {
  const [accounts, setAccounts] = useState<StockAccount[]>([]);
  const [accountId, setAccountId] = useState<string>(
    tx?.account_id ?? prefill?.account_id ?? defaultAccountId ?? '',
  );
  const [type, setType] = useState<'BUY' | 'SELL'>(tx?.type ?? prefill?.type ?? 'BUY');
  const [ticker, setTicker] = useState(tx?.ticker ?? prefill?.ticker ?? '');
  const [companyName, setCompanyName] = useState(tx?.company_name ?? prefill?.company_name ?? '');
  const [date, setDate] = useState(tx?.date ?? prefill?.date ?? dayjs().format('YYYY-MM-DD'));
  const [quantity, setQuantity] = useState<string>(
    tx ? String(tx.quantity) : prefill?.quantity != null ? String(prefill.quantity) : '',
  );
  const [price, setPrice] = useState<string>(
    tx ? String(tx.price) : prefill?.price != null ? String(prefill.price) : '',
  );
  const [fee, setFee] = useState<string>(
    tx?.fee != null ? String(tx.fee) : prefill?.fee != null ? String(prefill.fee) : '',
  );
  const [tax, setTax] = useState<string>(
    tx?.tax != null ? String(tx.tax) : prefill?.tax != null ? String(prefill.tax) : '',
  );
  const [memo, setMemo] = useState(tx?.memo ?? prefill?.memo ?? '');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 종목 검색 상태
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<KrxResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 계좌 로드
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/accounts`);
        const json = await res.json();
        const list: StockAccount[] = json.accounts ?? [];
        setAccounts(list);
        if (!accountId && list.length > 0) setAccountId(list[0].id);
      } catch (e) {
        console.error('[accounts load]', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 종목 검색 (디바운스)
  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      return;
    }
    const h = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/stocks/krx-search?q=${encodeURIComponent(search.trim())}`);
        const json = await res.json();
        setSearchResults(Array.isArray(json) ? json : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [search]);

  const pickStock = (r: KrxResult) => {
    setTicker(r.ticker);
    setCompanyName(r.name);
    setSearch('');
    setSearchResults([]);
  };

  const handleSave = useCallback(async () => {
    setErrorMsg(null);
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    if (!accountId) return setErrorMsg('계좌를 선택해주세요.');
    if (!ticker.trim()) return setErrorMsg('종목을 선택해주세요.');
    if (!date) return setErrorMsg('날짜를 입력해주세요.');
    if (!isFinite(q) || q <= 0) return setErrorMsg('수량을 올바르게 입력해주세요.');
    if (!isFinite(p) || p < 0) return setErrorMsg('단가를 올바르게 입력해주세요.');

    const feeNum = parseFloat(fee);
    const taxNum = parseFloat(tax);
    const payload = {
      account_id: accountId,
      ticker: ticker.trim().toUpperCase(),
      company_name: companyName.trim(),
      type,
      date,
      quantity: q,
      price: p,
      fee: isFinite(feeNum) && feeNum >= 0 ? feeNum : 0,
      tax: type === 'SELL' && isFinite(taxNum) && taxNum >= 0 ? taxNum : 0,
      memo: memo.trim(),
    };

    setSaving(true);
    try {
      const url =
        mode === 'edit' && tx
          ? `${apiBase}/transactions/${tx.id}`
          : `${apiBase}/transactions`;
      const method = mode === 'edit' ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [accountId, ticker, companyName, type, date, quantity, price, fee, tax, memo, mode, tx, apiBase, onSaved, onClose]);

  const handleDelete = useCallback(async () => {
    if (mode !== 'edit' || !tx) return;
    if (!confirm('이 거래를 삭제할까요?')) return;
    setDeleting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${apiBase}/transactions/${tx.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }, [mode, tx, apiBase, onSaved, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-lg font-bold text-gray-900">
            {mode === 'edit' ? '거래 수정' : '거래 추가'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-4">
          {/* 계좌 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">계좌</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            >
              <option value="" disabled>
                계좌를 선택하세요
              </option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.owner?.name ? `${a.owner.name} · ` : ''}
                  {a.broker_name}
                  {a.account_number ? ` (${a.account_number})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* BUY / SELL 토글 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setType('BUY')}
              className={`py-2.5 rounded-xl text-sm font-semibold border ${
                type === 'BUY'
                  ? 'bg-red-50 border-red-300 text-red-600'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              매수
            </button>
            <button
              onClick={() => setType('SELL')}
              className={`py-2.5 rounded-xl text-sm font-semibold border ${
                type === 'SELL'
                  ? 'bg-blue-50 border-blue-300 text-blue-600'
                  : 'bg-white border-gray-200 text-gray-500'
              }`}
            >
              매도
            </button>
          </div>

          {/* 종목 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">종목</label>

            {/* 검색창 */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="종목명 / 코드 / 티커 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  검색 중…
                </span>
              )}
            </div>

            {searchResults.length > 0 && (
              <ul className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                {searchResults.map((r) => (
                  <li key={r.code}>
                    <button
                      onClick={() => pickStock(r)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left active:bg-gray-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{r.name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">
                          {r.ticker} · {r.market}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* 직접 입력 */}
            <div className="grid grid-cols-2 gap-2 mt-2">
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="티커 (예: 005930.KS)"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="종목명"
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          {/* 날짜 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">날짜</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>

          {/* 수량 / 단가 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">수량</label>
              <input
                type="number"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">단가</label>
              <input
                type="number"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
          </div>

          {/* 수수료 / 세금 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                수수료 <span className="text-gray-300">(원)</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                거래세 <span className="text-gray-300">{type === 'SELL' ? '(매도시)' : '(N/A)'}</span>
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={type === 'SELL' ? tax : ''}
                onChange={(e) => setTax(e.target.value)}
                disabled={type !== 'SELL'}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none disabled:opacity-40 disabled:bg-gray-50"
              />
            </div>
          </div>

          {/* 금액 미리보기 */}
          {quantity && price && isFinite(parseFloat(quantity)) && isFinite(parseFloat(price)) && (() => {
            const gross = parseFloat(quantity) * parseFloat(price);
            const f = isFinite(parseFloat(fee)) ? parseFloat(fee) : 0;
            const t = type === 'SELL' && isFinite(parseFloat(tax)) ? parseFloat(tax) : 0;
            const net = type === 'BUY' ? gross + f : gross - f - t;
            return (
              <div className="text-right text-xs text-gray-500 space-y-0.5">
                <div>거래대금 {gross.toLocaleString('ko-KR')}원</div>
                {(f > 0 || t > 0) && (
                  <div className="text-gray-400">
                    {f > 0 && `수수료 ${f.toLocaleString('ko-KR')}`}
                    {f > 0 && t > 0 && ' · '}
                    {t > 0 && `거래세 ${t.toLocaleString('ko-KR')}`}
                  </div>
                )}
                <div className="font-semibold text-gray-700">
                  {type === 'BUY' ? '실매수' : '실수령'} {Math.round(net).toLocaleString('ko-KR')}원
                </div>
              </div>
            );
          })()}

          {/* 메모 */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">메모</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="(선택)"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:border-indigo-400 focus:outline-none resize-none"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-xs">
              {errorMsg}
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex-shrink-0 px-5 pt-2 pb-6 border-t border-gray-100 flex gap-2">
          {mode === 'edit' && (
            <button
              onClick={handleDelete}
              disabled={deleting || saving}
              className="px-4 py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving || deleting}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold active:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? '저장 중…' : mode === 'edit' ? '수정' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
