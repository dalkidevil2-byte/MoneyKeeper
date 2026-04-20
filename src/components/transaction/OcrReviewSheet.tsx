'use client';

import { useState } from 'react';
import { X, Check, Trash2, Store, ChevronDown } from 'lucide-react';
import { formatAmount } from '@/lib/parser';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import dayjs from 'dayjs';

const UNIT_OPTIONS = ['개', '캔', '병', '봉', '팩', '박스', '장', '구', '인분', '묶음', '롤', '포'];

interface OcrItem {
  id: string;
  name: string;
  amount: number;
  quantity: number;
  unit: string;
  category_main: string;
  category_sub: string;
  selected: boolean;
  track: boolean;
}

interface Props {
  result: {
    store_name: string;
    date: string;
    items: { name: string; amount: number; quantity: number; unit?: string; category_main: string; category_sub?: string }[];
    total: number;
    payment_hint: string;
  };
  paymentMethods: { id: string; name: string }[];
  members: { id: string; name: string; color: string }[];
  onConfirm: (items: OcrItem[], meta: { date: string; payment_method_id: string; member_id: string; saveImage: boolean }) => void;
  onClose: () => void;
}

export default function OcrReviewSheet({ result, paymentMethods, members, onConfirm, onClose }: Props) {
  const [items, setItems] = useState<OcrItem[]>(
    result.items.map((item, i) => ({
      ...item,
      id: String(i),
      unit: item.unit || '개',
      category_sub: item.category_sub || '',
      selected: item.amount > 0,
      track: false,
    }))
  );
  const [date, setDate] = useState(result.date || dayjs().format('YYYY-MM-DD'));
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saveImage, setSaveImage] = useState(false);

  const selectedItems = items.filter((i) => i.selected && i.amount > 0);
  const total = selectedItems.reduce((s, i) => s + Math.abs(i.amount), 0);

  const updateItem = (id: string, patch: Partial<OcrItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Store size={16} className="text-indigo-500" />
              {result.store_name || '영수증 확인'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {selectedItems.length}개 선택 · 합계 {formatAmount(total)}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {/* 날짜 / 결제수단 / 결제자 */}
          <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">날짜</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">결제수단</label>
                <select
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none"
                >
                  <option value="">선택 안함</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {members.length > 1 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">결제자</label>
                <div className="flex gap-2 flex-wrap">
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMemberId(memberId === m.id ? '' : m.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${
                        memberId === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                      }`}
                      style={memberId === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 전체 선택/해제 */}
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-gray-500">품목 목록</p>
            <button
              onClick={() => {
                const allSelected = items.every((i) => i.selected || i.amount <= 0);
                setItems((prev) => prev.map((i) => ({ ...i, selected: i.amount > 0 ? !allSelected : false })));
              }}
              className="text-xs text-indigo-500 font-medium"
            >
              {items.every((i) => i.selected || i.amount <= 0) ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          {/* 품목 리스트 */}
          {items.map((item) => {
            const unitPrice = item.quantity > 0 && item.amount > 0
              ? Math.round(item.amount / item.quantity)
              : null;
            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border transition-colors ${
                  item.selected ? 'border-indigo-200' : 'border-gray-100 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  {/* 체크박스 */}
                  <button
                    onClick={() => updateItem(item.id, { selected: !item.selected })}
                    className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      item.selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
                    }`}
                  >
                    {item.selected && <Check size={11} className="text-white" strokeWidth={3} />}
                  </button>

                  {/* 이름 + 단가 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">
                      {item.category_main}
                      {unitPrice && (
                        <span className="ml-1.5 text-indigo-400 font-medium">
                          · 단가 {formatAmount(unitPrice)}/{item.unit}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* 금액 */}
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-bold ${item.amount < 0 ? 'text-emerald-600' : 'text-gray-800'}`}>
                      {item.amount < 0 ? '-' : ''}{formatAmount(Math.abs(item.amount))}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-xs text-gray-400">{item.quantity}{item.unit} 구매</p>
                    )}
                  </div>

                  {/* 펼치기 */}
                  <button
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    className="text-gray-300 flex-shrink-0"
                  >
                    <ChevronDown size={16} className={`transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {/* 확장 편집 */}
                {expandedId === item.id && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-50 pt-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">품목명</label>
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => updateItem(item.id, { name: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">총 금액</label>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={(e) => updateItem(item.id, { amount: parseInt(e.target.value) || 0 })}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">수량</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.quantity}
                          onChange={(e) => {
                            // 숫자 + 소수점 1개만 허용
                            const raw = e.target.value
                              .replace(/[^0-9.]/g, '')
                              .replace(/(\..*)\./g, '$1');
                            updateItem(item.id, { quantity: raw === '' || raw === '.' ? 1 : parseFloat(raw) });
                          }}
                          onFocus={(e) => e.target.select()}
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">단위 (직접입력 가능)</label>
                        <input
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                          placeholder="개, 300g, 500ml, 캔 ..."
                          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                      </div>
                    </div>
                    {item.quantity > 1 && Math.abs(item.amount) > 0 && (
                      <p className="text-xs text-indigo-500 px-1">
                        단가: {Math.round(Math.abs(item.amount) / item.quantity).toLocaleString('ko-KR')}원/{item.unit || '개'}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">대분류</label>
                        <select
                          value={item.category_main}
                          onChange={(e) => updateItem(item.id, { category_main: e.target.value, category_sub: '' })}
                          className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none"
                        >
                          {CATEGORY_MAIN_OPTIONS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">소분류</label>
                        <select
                          value={item.category_sub}
                          onChange={(e) => updateItem(item.id, { category_sub: e.target.value })}
                          disabled={!item.category_main}
                          className="w-full border border-gray-200 rounded-xl px-2 py-2 text-sm bg-white focus:outline-none disabled:opacity-40"
                        >
                          <option value="">선택</option>
                          {(CATEGORY_SUB_MAP[item.category_main] ?? []).map((s: string) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {item.quantity > 0 && item.amount > 0 && (
                      <p className="text-xs text-indigo-500 font-medium">
                        단가: {formatAmount(Math.round(item.amount / item.quantity))}/{item.unit}
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-600">
                        <input
                          type="checkbox"
                          checked={item.track}
                          onChange={(e) => updateItem(item.id, { track: e.target.checked })}
                          className="rounded border-gray-300 accent-indigo-500"
                        />
                        <span>📊 품목 추적에 추가</span>
                      </label>
                      <button
                        onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                        className="flex items-center gap-1 text-xs text-rose-400 font-medium"
                      >
                        <Trash2 size={12} /> 항목 삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 pb-6 pt-3 flex-shrink-0 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-gray-500">{selectedItems.length}개 품목 · 거래 1건</p>
            <p className="text-base font-bold text-gray-900">{formatAmount(total)}</p>
          </div>
          {/* 이미지 저장 여부 */}
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={saveImage}
              onChange={(e) => setSaveImage(e.target.checked)}
              className="w-4 h-4 rounded accent-indigo-600"
            />
            <span className="text-xs text-gray-500">영수증 이미지 저장 (기본: OCR만 분석)</span>
          </label>
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-3 border border-gray-200 text-gray-600 rounded-2xl text-sm font-medium">
              취소
            </button>
            <button
              onClick={() => onConfirm(selectedItems, { date, payment_method_id: paymentMethodId, member_id: memberId, saveImage })}
              disabled={selectedItems.length === 0}
              className="flex-[2] py-3 bg-indigo-600 text-white rounded-2xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Check size={16} /> 등록하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
