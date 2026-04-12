'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, ArrowRight, ChevronDown, CheckCircle, AlertCircle, Mic, MicOff, Camera, FileText, Package, Plus, Minus } from 'lucide-react';
import type { ParsedTransaction, CreateTransactionInput } from '@/types';
import {
  TRANSACTION_TYPE_LABELS,
  CATEGORY_MAIN_OPTIONS,
  CATEGORY_SUB_MAP,
} from '@/types';
import { useParseText, useSaveTransaction } from '@/hooks/useTransactions';
import { useAccounts, usePaymentMethods, useMembers, useBudgets, useCustomCategories } from '@/hooks/useAccounts';
import CategoryCombobox from '@/components/CategoryCombobox';
import ReceiptAttachment from '@/components/ReceiptAttachment';
import OcrReviewSheet from '@/components/transaction/OcrReviewSheet';
import { useTransactions } from '@/hooks/useTransactions';
import { formatAmount } from '@/lib/parser';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  prefill?: {
    name: string;
    amount: number;
    type?: string;
    category_main: string;
    category_sub: string;
    payment_method_id: string | null;
    account_from_id?: string | null;
    account_to_id?: string | null;
  } | null;
}

export default function TransactionInputModal({ open, onClose, onSaved, prefill }: Props) {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [inputMode, setInputMode] = useState<'text' | 'ocr'>('text');
  const [inputText, setInputText] = useState('');
  const [form, setForm] = useState<Partial<CreateTransactionInput>>({});

  // 세부 품목
  const UNIT_OPTIONS = ['개', '캔', '병', '봉', '팩', '박스', '장', 'g', 'kg', 'ml', 'L', '구', '인분'];
  interface LineItem { id: string; name: string; quantity: number; price: number; unit: string }
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showLineItems, setShowLineItems] = useState(false);
  const addLineItem = () => setLineItems((p) => [...p, { id: crypto.randomUUID(), name: '', quantity: 1, price: 0, unit: '개' }]);
  const removeLineItem = (id: string) => setLineItems((p) => p.filter((i) => i.id !== id));
  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    const next = lineItems.map((i) => (i.id === id ? { ...i, [field]: value } : i));
    setLineItems(next);
    // 품목 합계를 거래 금액에 자동 반영
    const total = next.filter((i) => i.price > 0).reduce((s, i) => s + i.price, 0);
    if (total > 0) setForm((f) => ({ ...f, amount: total }));
  };

  // 음성 인식
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { parsed, parsing, parseText, clearParsed } = useParseText();
  const { saveTransaction, saving, error: saveError } = useSaveTransaction();
  const { accounts } = useAccounts();
  const { paymentMethods } = usePaymentMethods();
  const { members } = useMembers();
  const { budgets } = useBudgets();
  const { categories: customCategories, refetch: refetchCategories } = useCustomCategories();

  // 기본 + 커스텀 카테고리 머지
  const allMainCategories = useMemo(() => {
    const customs = customCategories
      .map((c) => c.category_main)
      .filter((m, i, arr) => m && arr.indexOf(m) === i && !CATEGORY_MAIN_OPTIONS.includes(m as any));
    return [...CATEGORY_MAIN_OPTIONS, ...customs];
  }, [customCategories]);

  const getSubOptions = (main: string) => {
    const defaults = CATEGORY_SUB_MAP[main] ?? [];
    const customs = customCategories
      .filter((c) => c.category_main === main && c.category_sub)
      .map((c) => c.category_sub)
      .filter((s, i, arr) => arr.indexOf(s) === i && !defaults.includes(s));
    return [...defaults, ...customs];
  };
  const handleAddMainCategory = async (name: string) => {
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: name, category_sub: '' }),
    });
    refetchCategories();
  };

  const handleAddSubCategory = async (sub: string) => {
    if (!form.category_main) return;
    await fetch('/api/custom-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_main: form.category_main, category_sub: sub }),
    });
    refetchCategories();
  };

  const today = dayjs();
  const { transactions: monthTxs } = useTransactions({
    startDate: today.startOf('month').format('YYYY-MM-DD'),
    endDate:   today.endOf('month').format('YYYY-MM-DD'),
  });

  // 저장 직전 예산 초과 여부 확인
  const [budgetWarningMsg, setBudgetWarningMsg] = useState<string | null>(null);
  const [ignoreWarning, setIgnoreWarning] = useState(false);

  const checkBudget = (f: typeof form): string | null => {
    if (!f.category_main || !['variable_expense', 'fixed_expense'].includes(f.type ?? '')) return null;
    const budget = budgets.find((b) => !b.is_total && b.category_main === f.category_main);
    if (!budget) return null;
    const alreadySpent = monthTxs
      .filter((t) => ['variable_expense', 'fixed_expense'].includes(t.type) && t.category_main === f.category_main)
      .reduce((s, t) => s + t.amount, 0);
    const newTotal = alreadySpent + (f.amount ?? 0);
    const rate = Math.round((newTotal / budget.amount) * 100);
    if (rate >= 100) return `${f.category_main} 예산을 초과해요! (${formatAmount(newTotal)} / ${formatAmount(budget.amount)})`;
    if (rate >= 80)  return `${f.category_main} 예산의 ${rate}%에 도달해요 (${formatAmount(budget.amount - alreadySpent)} 남음)`;
    return null;
  };

  // prefill (정기 거래 템플릿) → 폼 초기화
  useEffect(() => {
    if (!open || !prefill) return;
    setForm({
      date: dayjs().format('YYYY-MM-DD'),
      type: (prefill.type as any) ?? 'fixed_expense',
      amount: prefill.amount,
      name: prefill.name,
      merchant_name: prefill.name,
      category_main: prefill.category_main,
      category_sub: prefill.category_sub,
      payment_method_id: prefill.payment_method_id ?? undefined,
      account_from_id: prefill.account_from_id ?? undefined,
      account_to_id: prefill.account_to_id ?? undefined,
    });
    setStep('preview');
  }, [open, prefill]);

  const [categoryHint, setCategoryHint] = useState<{ category_main: string; category_sub: string; count: number } | null>(null);

  // 파싱 결과 → 폼 초기화
  useEffect(() => {
    if (!parsed) return;

    // 결제수단 힌트로 매칭
    const matchedPM = paymentMethods.find((pm) =>
      pm.name.includes(parsed.payment_method_hint) ||
      parsed.payment_method_hint.includes(pm.type.replace('_', ''))
    );

    // 계좌 힌트 매칭 (이동)
    const matchedFromAccount = parsed.transfer_from_hint
      ? accounts.find((a) => a.name.includes(parsed.transfer_from_hint) || parsed.transfer_from_hint.includes(a.name))
      : matchedPM?.linked_account_id
      ? accounts.find((a) => a.id === matchedPM.linked_account_id)
      : undefined;

    const matchedToAccount = parsed.transfer_to_hint
      ? accounts.find((a) => a.name.includes(parsed.transfer_to_hint) || parsed.transfer_to_hint.includes(a.name))
      : undefined;

    const baseForm = {
      date: parsed.date,
      type: parsed.type,
      amount: parsed.amount ?? undefined,
      name: parsed.name,
      merchant_name: parsed.merchant_name,
      category_main: parsed.category_main,
      category_sub: parsed.category_sub,
      payment_method_id: matchedPM?.id,
      account_from_id: matchedFromAccount?.id,
      account_to_id: matchedToAccount?.id,
      input_type: 'text' as const,
      raw_input: inputText,
    };

    setForm(baseForm);
    setStep('preview');
    setCategoryHint(null);

    // 가맹점명으로 카테고리 힌트 조회
    const merchantKey = parsed.merchant_name || parsed.name;
    if (merchantKey) {
      fetch(`/api/transactions/category-hint?merchant=${encodeURIComponent(merchantKey)}`)
        .then((r) => r.json())
        .then(({ hint }) => {
          if (hint) {
            setCategoryHint(hint);
            setForm((f) => ({ ...f, category_main: hint.category_main, category_sub: hint.category_sub }));
          }
        });
    }
  }, [parsed]);

  const handleParse = () => {
    if (!inputText.trim()) return;
    parseText(inputText);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  const handleSave = async () => {
    if (!form.amount || !form.date) return;

    // 예산 경고 체크 (처음 저장 시도 시)
    if (!ignoreWarning) {
      const warning = checkBudget(form);
      if (warning) {
        setBudgetWarningMsg(warning);
        return; // 저장 막고 경고 표시
      }
    }

    const input: CreateTransactionInput = {
      household_id: process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!,
      member_id: form.member_id,
      target_member_id: form.target_member_id,
      date: form.date!,
      type: form.type ?? 'variable_expense',
      amount: form.amount!,
      name: form.name ?? '',
      merchant_name: form.merchant_name ?? '',
      account_from_id: form.account_from_id,
      account_to_id: form.account_to_id,
      payment_method_id: form.payment_method_id,
      category_main: form.category_main ?? '',
      category_sub: form.category_sub ?? '',
      memo: form.memo ?? '',
      receipt_url: form.receipt_url ?? '',
      input_type: 'text',
      raw_input: inputText,
    };

    const tx = await saveTransaction(input);
    if (tx) {
      // 세부 품목 저장
      const validItems = lineItems.filter((i) => i.name.trim() && i.price > 0);
      if (validItems.length > 0) {
        await fetch(`/api/transactions/${tx.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: validItems.map(({ id, ...rest }) => rest) }),
        });
      }
      handleClose();
      onSaved();
    }
  };

  const handleClose = () => {
    setStep('input');
    setInputMode('text');
    setInputText('');
    setForm({});
    setOcrResult(null);
    setListening(false);
    setCategoryHint(null);
    setLineItems([]);
    setShowLineItems(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    clearParsed();
    setBudgetWarningMsg(null);
    setIgnoreWarning(false);
    onClose();
  };

  // 음성 인식 토글
  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert('이 브라우저는 음성 인식을 지원하지 않아요.'); return; }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = 'ko-KR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setInputText((prev) => prev ? prev + ' ' + transcript : transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  // OCR 이미지 처리
  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/transactions/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.result) setOcrResult(data.result);
      else alert('영수증을 인식하지 못했어요. 다시 시도해주세요.');
    } catch {
      alert('OCR 오류가 발생했어요.');
    } finally {
      setOcrLoading(false);
      if (ocrFileRef.current) ocrFileRef.current.value = '';
    }
  };

  // OCR 확인 후 등록: 거래 1건 + items 테이블
  const handleOcrConfirm = async (
    items: any[],
    meta: { date: string; payment_method_id: string; member_id: string }
  ) => {
    const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
    const storeName = ocrResult?.store_name || '마트';
    const total = items.reduce((s: number, i: any) => s + Math.abs(i.amount), 0);

    // 카테고리 중 가장 많이 쓰인 것 선택
    const catCount: Record<string, number> = {};
    items.forEach((i: any) => { catCount[i.category_main] = (catCount[i.category_main] ?? 0) + 1; });
    const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '식비';

    // 1. 거래 1건 생성 (총액)
    const txRes = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        date: meta.date,
        type: 'variable_expense',
        amount: total,
        name: storeName,
        merchant_name: storeName,
        category_main: topCat,
        category_sub: '',
        payment_method_id: meta.payment_method_id || null,
        member_id: meta.member_id || null,
        memo: `OCR 등록 (${items.length}개 품목)`,
        input_type: 'receipt',
      }),
    });

    if (!txRes.ok) { alert('저장 중 오류가 발생했어요.'); return; }
    const { transaction } = await txRes.json();

    // 2. 세부 품목 저장
    await fetch(`/api/transactions/${transaction.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity || 1,
          price: Math.abs(item.amount),
          unit: item.unit || '개',
          category_main: item.category_main || '',
        })),
      }),
    });

    setOcrResult(null);
    handleClose();
    onSaved();
  };

  if (!open) return null;

  // OCR 결과 확인 시트
  if (ocrResult) {
    return (
      <OcrReviewSheet
        result={ocrResult}
        paymentMethods={paymentMethods}
        members={members}
        onConfirm={handleOcrConfirm}
        onClose={() => setOcrResult(null)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">
        {/* 핸들 */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'input' ? '거래 입력' : '내용 확인'}
          </h2>
          <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4 overflow-y-auto flex-1">
          {/* ── STEP 1: 입력 ── */}
          {step === 'input' && (
            <>
              {/* 입력 모드 탭 */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    inputMode === 'text' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                  }`}
                >
                  <FileText size={14} /> 텍스트
                </button>
                <button
                  onClick={() => setInputMode('ocr')}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                    inputMode === 'ocr' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                  }`}
                >
                  <Camera size={14} /> 영수증 OCR
                </button>
              </div>

              {inputMode === 'text' ? (
                <>
                  <div className="relative">
                    <p className="text-sm text-gray-500 mb-2">
                      자연어로 입력하면 자동으로 분류해드려요
                    </p>
                    <textarea
                      ref={inputRef}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={'스타벅스 4500 카드\n이마트 장보기 38000원\n카카오페이 3만원 충전'}
                      className="w-full border border-gray-200 rounded-2xl p-4 pr-12 text-base resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 h-28 bg-gray-50 placeholder-gray-400"
                      autoFocus
                    />
                    {/* 음성 버튼 */}
                    <button
                      type="button"
                      onClick={toggleVoice}
                      className={`absolute right-3 bottom-3 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        listening
                          ? 'bg-rose-500 text-white animate-pulse'
                          : 'bg-gray-200 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
                      }`}
                    >
                      {listening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  </div>
                  {listening && (
                    <p className="text-xs text-rose-500 text-center -mt-2 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                      듣고 있어요... 말씀해주세요
                    </p>
                  )}
                  <p className="text-xs text-gray-400 -mt-1">Enter 키 또는 아래 버튼으로 분석 · 🎤 마이크로 음성 입력</p>

                  <button
                    onClick={handleParse}
                    disabled={!inputText.trim() || parsing}
                    className="w-full py-4 bg-indigo-600 text-white font-semibold rounded-2xl active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {parsing ? (
                      <span className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        분석 중...
                      </span>
                    ) : (
                      <>분석하기 <ArrowRight size={18} /></>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setForm({ date: dayjs().format('YYYY-MM-DD'), type: 'variable_expense' });
                      setStep('preview');
                    }}
                    className="w-full py-2.5 text-sm text-gray-400 hover:text-indigo-500 transition-colors"
                  >
                    직접 입력하기
                  </button>

                  <div>
                    <p className="text-xs text-gray-400 mb-2">빠른 입력 예시</p>
                    <div className="flex flex-wrap gap-2">
                      {['스타벅스 4500 카드', '편의점 2300', '월급 350만원', '카카오페이 3만원 충전'].map((ex) => (
                        <button
                          key={ex}
                          onClick={() => setInputText(ex)}
                          className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-full active:bg-gray-200"
                        >
                          {ex}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* OCR 모드 */
                <div className="space-y-3">
                  <p className="text-sm text-gray-500">마트/식당 영수증을 촬영하거나 업로드하면 품목을 자동으로 추출해요.</p>
                  <input
                    ref={ocrFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleOcrFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => ocrFileRef.current?.click()}
                    disabled={ocrLoading}
                    className="w-full border-2 border-dashed border-indigo-200 rounded-2xl py-10 flex flex-col items-center gap-3 text-indigo-400 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    {ocrLoading ? (
                      <>
                        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-sm font-medium text-indigo-600">영수증 분석 중...</p>
                        <p className="text-xs text-indigo-400">GPT-4o가 품목을 추출하고 있어요</p>
                      </>
                    ) : (
                      <>
                        <Camera size={32} />
                        <p className="text-sm font-medium">영수증 촬영 / 업로드</p>
                        <p className="text-xs text-gray-400">JPG, PNG 지원 · 여러 품목 한 번에 등록</p>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: 미리보기 / 수정 ── */}
          {step === 'preview' && (
            <>
              {/* 금액 (크게) */}
              {(() => {
                const itemsTotal = lineItems.filter((i) => i.price > 0).reduce((s, i) => s + i.price, 0);
                const autoCalc = itemsTotal > 0;
                return (
                  <div className="text-center py-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="금액 입력"
                      readOnly={autoCalc}
                      value={form.amount ? form.amount.toLocaleString() : ''}
                      className={`text-3xl font-bold text-center w-full border-b-2 outline-none pb-1 ${
                        autoCalc
                          ? 'border-indigo-200 text-indigo-500 bg-transparent'
                          : 'border-indigo-400 text-gray-900'
                      }`}
                      onChange={(e) => {
                        if (autoCalc) return;
                        const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                        setForm((f) => ({ ...f, amount: isNaN(v) ? undefined : v }));
                      }}
                    />
                    {autoCalc && (
                      <p className="text-xs text-indigo-400 mt-1">품목 합계 자동계산</p>
                    )}
                    {parsed?.confidence === 'low' && (
                      <p className="text-xs text-amber-500 mt-1">⚠️ 금액을 확인해주세요</p>
                    )}
                  </div>
                );
              })()}

              {/* 거래 유형 탭 */}
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
                {(['income', 'variable_expense', 'fixed_expense', 'transfer'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      form.type === t
                        ? 'bg-white shadow text-indigo-600'
                        : 'text-gray-500'
                    }`}
                  >
                    {TRANSACTION_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              {/* 폼 필드들 */}
              <div className="space-y-3">
                {/* 날짜 + 거래명 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">날짜</label>
                    <input
                      type="date"
                      value={form.date ?? dayjs().format('YYYY-MM-DD')}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">가맹점</label>
                    <input
                      type="text"
                      value={form.merchant_name ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, merchant_name: e.target.value, name: e.target.value }))}
                      placeholder="어디서?"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>

                {/* 카테고리 */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-xs text-gray-400">대분류</label>
                      {categoryHint && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                          학습됨 {categoryHint.count}회
                        </span>
                      )}
                    </div>
                    <CategoryCombobox
                      value={form.category_main ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, category_main: v, category_sub: '' }))}
                      options={allMainCategories as unknown as string[]}
                      placeholder="선택"
                      onAddOption={handleAddMainCategory}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">소분류</label>
                    <CategoryCombobox
                      value={form.category_sub ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, category_sub: v }))}
                      options={getSubOptions(form.category_main ?? '')}
                      placeholder="선택"
                      disabled={!form.category_main}
                      onAddOption={form.category_main ? handleAddSubCategory : undefined}
                    />
                  </div>
                </div>

                {/* 결제수단 */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">결제수단</label>
                  <select
                    value={form.payment_method_id ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value || undefined }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  >
                    <option value="">선택 안함</option>
                    {form.member_id
                      ? (() => {
                          const mine = paymentMethods.filter((pm) => pm.member_id === form.member_id);
                          const shared = paymentMethods.filter((pm) => !pm.member_id);
                          return (
                            <>
                              {mine.length > 0 && (
                                <optgroup label={members.find((m) => m.id === form.member_id)?.name ?? ''}>
                                  {mine.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                                </optgroup>
                              )}
                              {shared.length > 0 && (
                                <optgroup label="공용">
                                  {shared.map((pm) => <option key={pm.id} value={pm.id}>{pm.name}</option>)}
                                </optgroup>
                              )}
                            </>
                          );
                        })()
                      : paymentMethods.map((pm) => (
                          <option key={pm.id} value={pm.id}>{pm.name}</option>
                        ))
                    }
                  </select>
                </div>

                {/* 자금이동 전용: 계좌 선택 */}
                {form.type === 'transfer' && (
                  <div className="bg-blue-50 rounded-xl p-3 space-y-2">
                    <p className="text-xs font-medium text-blue-600">🔄 자금 이동 계좌</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">출금 계좌 (from)</label>
                        <select
                          value={form.account_from_id ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, account_from_id: e.target.value || undefined }))}
                          className="w-full border border-blue-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                          <option value="">선택</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 mb-1 block">입금 계좌 (to)</label>
                        <select
                          value={form.account_to_id ?? ''}
                          onChange={(e) => setForm((f) => ({ ...f, account_to_id: e.target.value || undefined }))}
                          className="w-full border border-blue-200 rounded-lg px-2 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                          <option value="">선택</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 결제자 + 대상 */}
                {members.length > 1 && (
                  <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                    {/* 결제자 */}
                    <div>
                      <label className="text-xs font-medium mb-2 block text-gray-500">💳 결제자</label>
                      <div className="flex gap-2 flex-wrap">
                        {members.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setForm((f) => ({ ...f, member_id: f.member_id === m.id ? undefined : m.id }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                              form.member_id === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                            }`}
                            style={form.member_id === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.member_id === m.id ? 'rgba(255,255,255,0.7)' : m.color }} />
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* 지출 대상 */}
                    <div>
                      <label className="text-xs font-medium mb-2 block text-gray-500">🎯 지출 대상</label>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => setForm((f) => ({ ...f, target_member_id: undefined }))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                            !form.target_member_id ? 'bg-violet-500 text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                          }`}
                        >
                          🫂 함께
                        </button>
                        {members.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => setForm((f) => ({ ...f, target_member_id: f.target_member_id === m.id ? undefined : m.id }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                              form.target_member_id === m.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                            }`}
                            style={form.target_member_id === m.id ? { backgroundColor: m.color, borderColor: m.color } : {}}
                          >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.target_member_id === m.id ? 'rgba(255,255,255,0.7)' : m.color }} />
                            {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 메모 */}
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">메모 (선택)</label>
                  <input
                    type="text"
                    value={form.memo ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                    placeholder="추가 메모..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>

                {/* 세부 품목 */}
                {['variable_expense', 'fixed_expense'].includes(form.type ?? 'variable_expense') && (
                  <div>
                    <button
                      type="button"
                      onClick={async () => {
                        setShowLineItems((v) => !v);
                        if (!showLineItems && lineItems.length === 0) {
                          const defaultName = form.merchant_name || form.name || '';
                          // 규칙 기반 기본 단위
                          const sub = (form.category_sub || '').toLowerCase();
                          const nameLower = (form.name || '').toLowerCase();
                          let defaultUnit = '개';
                          if (sub.includes('주유') || nameLower.includes('주유') || nameLower.includes('휘발유') || nameLower.includes('경유')) defaultUnit = 'L';
                          else if (nameLower.includes('세제') || nameLower.includes('샴푸') || nameLower.includes('린스')) defaultUnit = 'ml';
                          else if (nameLower.includes('쌀') || nameLower.includes('밀가루')) defaultUnit = 'kg';
                          else if (nameLower.includes('우유') || nameLower.includes('음료') || nameLower.includes('주스')) defaultUnit = 'L';

                          // 학습된 단위 조회 (있으면 override)
                          if (defaultName) {
                            try {
                              const res = await fetch(`/api/items/unit-hint?name=${encodeURIComponent(defaultName)}`);
                              const { hint } = await res.json();
                              if (hint?.unit) defaultUnit = hint.unit;
                            } catch {}
                          }

                          setLineItems([{ id: crypto.randomUUID(), name: defaultName, quantity: 1, price: 0, unit: defaultUnit }]);
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 active:bg-gray-100"
                    >
                      <span className="flex items-center gap-2">
                        <Package size={14} className="text-indigo-400" />
                        <span className="font-medium">세부 품목 입력</span>
                        {lineItems.filter((i) => i.name.trim() && i.price > 0).length > 0 && (
                          <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                            {lineItems.filter((i) => i.name.trim() && i.price > 0).length}개
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-gray-400">{showLineItems ? '닫기' : '단가 분석용'}</span>
                    </button>

                    {showLineItems && (
                      <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                        <p className="text-xs text-gray-400 mb-1">단가를 기록하면 나중에 어디서 더 싸게 살 수 있는지 분석해드려요</p>
                        {lineItems.map((item) => {
                          const unitPrice = item.quantity > 0 && item.price > 0
                            ? Math.round(item.price / item.quantity)
                            : null;
                          return (
                            <div key={item.id} className="bg-white rounded-xl p-3 space-y-2 border border-gray-100">
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateLineItem(item.id, 'name', e.target.value)}
                                  placeholder="품목명 (예: 맥주 500ml)"
                                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                />
                                <button
                                  onClick={() => removeLineItem(item.id)}
                                  className="p-1 text-gray-300 hover:text-rose-400"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                {/* 수량 */}
                                <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                                  <button
                                    onClick={() => updateLineItem(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                    className="px-2 py-1.5 text-gray-500 hover:bg-gray-100"
                                  >
                                    <Minus size={12} />
                                  </button>
                                  <input
                                    type="number"
                                    value={item.quantity}
                                    onChange={(e) => updateLineItem(item.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                                    className="w-10 text-center text-sm py-1.5 focus:outline-none"
                                    min={1}
                                  />
                                  <button
                                    onClick={() => updateLineItem(item.id, 'quantity', item.quantity + 1)}
                                    className="px-2 py-1.5 text-gray-500 hover:bg-gray-100"
                                  >
                                    <Plus size={12} />
                                  </button>
                                </div>
                                {/* 단위 */}
                                <select
                                  value={item.unit}
                                  onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                                  className="border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs bg-white focus:outline-none w-14"
                                >
                                  {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                                {/* 금액 */}
                                <input
                                  type="number"
                                  value={item.price || ''}
                                  onChange={(e) => updateLineItem(item.id, 'price', parseInt(e.target.value) || 0)}
                                  placeholder="금액"
                                  className="flex-1 text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                                />
                                <span className="text-xs text-gray-400">원</span>
                              </div>
                              {unitPrice && (
                                <p className="text-xs text-indigo-500 font-medium">
                                  단가 {unitPrice.toLocaleString()}원/{item.unit}
                                </p>
                              )}
                            </div>
                          );
                        })}
                        <button
                          onClick={addLineItem}
                          className="w-full py-2 border border-dashed border-indigo-200 rounded-xl text-xs text-indigo-500 hover:bg-indigo-50 flex items-center justify-center gap-1"
                        >
                          <Plus size={12} /> 품목 추가
                        </button>
                        {lineItems.filter((i) => i.price > 0).length > 1 && (
                          <p className="text-xs text-gray-400 text-right">
                            합계 {lineItems.filter((i) => i.price > 0).reduce((s, i) => s + i.price, 0).toLocaleString()}원
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* 참고 자료 */}
                <ReceiptAttachment
                  value={form.receipt_url ?? ''}
                  onChange={(url) => setForm((f) => ({ ...f, receipt_url: url }))}
                />
              </div>

              {/* 예산 경고 */}
              {budgetWarningMsg && !ignoreWarning && (
                <div className={`rounded-xl p-3 space-y-2 ${budgetWarningMsg.includes('초과') ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <div className="flex items-start gap-2">
                    <AlertCircle size={16} className={budgetWarningMsg.includes('초과') ? 'text-rose-500 flex-shrink-0 mt-0.5' : 'text-amber-500 flex-shrink-0 mt-0.5'} />
                    <p className={`text-sm font-medium ${budgetWarningMsg.includes('초과') ? 'text-rose-700' : 'text-amber-700'}`}>
                      {budgetWarningMsg}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBudgetWarningMsg(null)}
                      className="flex-1 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => { setIgnoreWarning(true); handleSave(); }}
                      className={`flex-1 py-2 text-xs font-medium text-white rounded-xl ${budgetWarningMsg.includes('초과') ? 'bg-rose-500' : 'bg-amber-500'}`}
                    >
                      그래도 저장
                    </button>
                  </div>
                </div>
              )}

              {/* 저장 오류 */}
              {saveError && (
                <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 rounded-xl p-3">
                  <AlertCircle size={16} />
                  {saveError}
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-3.5 border border-gray-200 text-gray-600 font-medium rounded-2xl active:bg-gray-50"
                >
                  다시 입력
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.amount || saving}
                  className="flex-[2] py-3.5 bg-indigo-600 text-white font-semibold rounded-2xl active:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : (
                    <><CheckCircle size={18} /> 저장하기</>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
