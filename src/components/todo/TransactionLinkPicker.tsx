'use client';
import { useEffect, useState } from 'react';
import { X, Search, Plus } from 'lucide-react';
import dayjs from 'dayjs';

interface Tx {
  id: string;
  date: string;
  amount: number;
  type: string;
  name?: string | null;
  merchant_name?: string | null;
  category_main?: string | null;
  member?: { name: string; color?: string | null } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 이미 연결된 거래 id 들 (체크박스 미리 켜놓음) */
  selectedIds: string[];
  /** 확정 시 콜백 — 새로 선택된 id 배열 전달 */
  onConfirm: (ids: string[]) => void;
  /** "+ 새 거래 추가" 클릭 시 콜백 — 부모가 TransactionInputModal 열도록 */
  onCreateNew: () => void;
}

export default function TransactionLinkPicker({
  open,
  onClose,
  selectedIds,
  onConfirm,
  onCreateNew,
}: Props) {
  const [query, setQuery] = useState('');
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(selectedIds));

  // open 될 때 picked 동기화
  useEffect(() => {
    if (open) setPicked(new Set(selectedIds));
  }, [open, selectedIds]);

  // 최근 60일 거래 로드
  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      try {
        const from = dayjs().subtract(60, 'day').format('YYYY-MM-DD');
        const to = dayjs().add(7, 'day').format('YYYY-MM-DD');
        const res = await fetch(
          `/api/transactions?from=${from}&to=${to}&limit=200`,
        );
        const json = await res.json();
        setTxs(json.transactions ?? []);
      } catch (e) {
        console.warn('tx load fail', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [open]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = query.trim()
    ? txs.filter((t) => {
        const q = query.toLowerCase();
        return (
          (t.name ?? '').toLowerCase().includes(q) ||
          (t.merchant_name ?? '').toLowerCase().includes(q) ||
          (t.category_main ?? '').toLowerCase().includes(q)
        );
      })
    : txs;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <div className="font-bold">💰 가계부 거래 연결</div>
          <button onClick={onClose} className="p-1 text-gray-400">
            <X size={20} />
          </button>
        </div>

        {/* 검색 + 새 거래 추가 */}
        <div className="p-3 space-y-2 border-b border-gray-100">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="거래명/가맹점/카테고리 검색"
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>
          <button
            onClick={onCreateNew}
            className="w-full flex items-center justify-center gap-1 py-2 bg-amber-50 text-amber-700 rounded-xl text-sm font-medium border border-amber-200"
          >
            <Plus size={16} /> 새 거래 추가하고 연결
          </button>
        </div>

        {/* 리스트 */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">
              불러오는 중…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-gray-400 py-8">
              {query ? '검색 결과 없음' : '거래가 없습니다'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filtered.map((t) => {
                const isOn = picked.has(t.id);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => toggle(t.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg text-left ${
                        isOn ? 'bg-amber-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          isOn
                            ? 'bg-amber-500 border-amber-500'
                            : 'border-gray-300'
                        }`}
                      >
                        {isOn && (
                          <span className="text-white text-xs">✓</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium truncate">
                            {t.name || t.merchant_name || '(이름없음)'}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {dayjs(t.date).format('M/D')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          {t.category_main && (
                            <span>{t.category_main}</span>
                          )}
                          {t.member && (
                            <span style={{ color: t.member.color ?? '#888' }}>
                              · {t.member.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-bold shrink-0 ${
                          t.type === 'income'
                            ? 'text-blue-600'
                            : 'text-red-600'
                        }`}
                      >
                        {t.type === 'income' ? '+' : '-'}
                        {Number(t.amount).toLocaleString()}원
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-3 border-t border-gray-100 flex items-center gap-2">
          <div className="text-xs text-gray-500 flex-1">
            선택 <b className="text-amber-700">{picked.size}</b>건
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500"
          >
            취소
          </button>
          <button
            onClick={() => {
              onConfirm(Array.from(picked));
              onClose();
            }}
            className="px-5 py-2 bg-amber-500 text-white rounded-xl text-sm font-bold"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
