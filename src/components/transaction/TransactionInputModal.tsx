'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  X, ChevronDown, ChevronUp, CheckCircle, AlertCircle,
  Mic, MicOff, Camera, Package, Plus, Minus, Lock,
} from 'lucide-react';
import type { CreateTransactionInput, ParsedTransaction } from '@/types';
import { CATEGORY_MAIN_OPTIONS, CATEGORY_SUB_MAP } from '@/types';
import { useSaveTransaction, useTransactions } from '@/hooks/useTransactions';
import { useAccounts, usePaymentMethods, useMembers, useBudgets, useCustomCategories } from '@/hooks/useAccounts';
import CategoryCombobox from '@/components/CategoryCombobox';
import ReceiptAttachment from '@/components/ReceiptAttachment';
import OcrReviewSheet from '@/components/transaction/OcrReviewSheet';
import { formatAmount, parseTransactionText } from '@/lib/parser';
import dayjs from 'dayjs';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** 새로 저장된 거래 id 회신 — 다른 엔티티에 즉시 연결할 때 사용 */
  onSavedWithId?: (id: string) => void;
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

interface LineItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
  unit: string;
  track: boolean;
  category_main?: string;
  category_sub?: string;
}

/** 상단 유형 탭 — 고정지출은 '지출' 안의 토글로 접어 넣음 */
const TABS = [
  { key: 'expense', label: '지출' },
  { key: 'income', label: '수입' },
  { key: 'transfer', label: '이동' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const INPUT_CLS =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300';

/** 라벨 + 입력칸 한 줄 */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-400 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export default function TransactionInputModal({ open, onClose, onSaved, onSavedWithId, prefill }: Props) {
  // ── 핵심 상태 ──
  const [quickText, setQuickText] = useState('');
  const [form, setForm] = useState<Partial<CreateTransactionInput>>({});
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [suggestionApplied, setSuggestionApplied] = useState<string | null>(null);

  /**
   * 사용자가 직접 만진 필드는 자동 파싱이 덮어쓰지 않는다.
   * (빠른 입력칸을 계속 고쳐도 손으로 고른 값이 유지되도록)
   */
  const touchedRef = useRef<Set<string>>(new Set());
  const setField = useCallback(<K extends keyof CreateTransactionInput>(key: K, value: CreateTransactionInput[K] | undefined) => {
    touchedRef.current.add(key as string);
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  // ── 세부 품목 ──
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showLineItems, setShowLineItems] = useState(false);

  // ── 음성 / OCR ──
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const ocrFileRef = useRef<HTMLInputElement>(null);

  // ── 데이터 ──
  const { saveTransaction, saving, error: saveError } = useSaveTransaction();
  const { accounts } = useAccounts();
  const { paymentMethods } = usePaymentMethods();
  const { members } = useMembers();
  const { budgets } = useBudgets();
  const { categories: customCategories, refetch: refetchCategories } = useCustomCategories();

  const today = dayjs();
  const { transactions: monthTxs } = useTransactions({
    startDate: today.startOf('month').format('YYYY-MM-DD'),
    endDate: today.endOf('month').format('YYYY-MM-DD'),
  });

  // ── 카테고리 (기본 + 커스텀) ──
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

  // ── 열릴 때 기본값 ──
  useEffect(() => {
    if (!open) return;
    touchedRef.current = new Set();
    setForm({ date: dayjs().format('YYYY-MM-DD'), type: 'variable_expense' });
  }, [open]);

  // ── prefill (고정지출 템플릿) — 손으로 채운 값으로 취급해 자동파싱이 덮지 않게 ──
  useEffect(() => {
    if (!open || !prefill) return;
    touchedRef.current = new Set([
      'type', 'amount', 'name', 'merchant_name', 'category_main',
      'category_sub', 'payment_method_id', 'account_from_id', 'account_to_id',
    ]);
    setForm({
      date: dayjs().format('YYYY-MM-DD'),
      type: (prefill.type as any) ?? 'fixed_expense',
      amount: prefill.amount || undefined,
      name: prefill.name,
      merchant_name: prefill.name,
      category_main: prefill.category_main,
      category_sub: prefill.category_sub,
      payment_method_id: prefill.payment_method_id ?? undefined,
      account_from_id: prefill.account_from_id ?? undefined,
      account_to_id: prefill.account_to_id ?? undefined,
    });
  }, [open, prefill]);

  // ── 빠른 입력칸 → 실시간 자동 채움 (로컬 규칙 파서, 서버 호출 없음) ──
  useEffect(() => {
    const text = quickText.trim();
    if (!text) {
      setParsed(null);
      return;
    }
    const timer = setTimeout(() => {
      const p = parseTransactionText(text);
      setParsed(p);

      const matchedPM = paymentMethods.find(
        (pm) =>
          p.payment_method_hint &&
          (pm.name.includes(p.payment_method_hint) ||
            p.payment_method_hint.includes(pm.type.replace('_', ''))),
      );
      const matchedFrom = p.transfer_from_hint
        ? accounts.find((a) => a.name.includes(p.transfer_from_hint) || p.transfer_from_hint.includes(a.name))
        : matchedPM?.linked_account_id
          ? accounts.find((a) => a.id === matchedPM.linked_account_id)
          : undefined;
      const matchedTo = p.transfer_to_hint
        ? accounts.find((a) => a.name.includes(p.transfer_to_hint) || p.transfer_to_hint.includes(a.name))
        : undefined;

      setForm((f) => {
        const next: Partial<CreateTransactionInput> = { ...f };
        const put = (key: string, value: unknown) => {
          if (value === undefined || value === null || value === '') return;
          if (touchedRef.current.has(key)) return;
          (next as any)[key] = value;
        };
        put('amount', p.amount ?? undefined);
        put('type', p.type);
        put('date', p.date);
        put('name', p.name);
        put('merchant_name', p.merchant_name);
        put('category_main', p.category_main);
        put('category_sub', p.category_sub);
        put('payment_method_id', matchedPM?.id);
        put('account_from_id', matchedFrom?.id);
        put('account_to_id', matchedTo?.id);
        return next;
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [quickText, paymentMethods, accounts]);

  // ── 과거 기록 학습 → 빈 필드만 자동 채움 ──
  useEffect(() => {
    const name = (form.name ?? '').trim();
    const merchant = (form.merchant_name ?? '').trim();
    if (name.length < 2 && merchant.length < 2) {
      setSuggestionApplied(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const param = name.length >= 2
          ? `name=${encodeURIComponent(name)}`
          : `merchant=${encodeURIComponent(merchant)}`;
        const res = await fetch(`/api/transactions/suggest?${param}`);
        const j = await res.json();
        if (!j.ok || !j.suggestion) return;
        const s = j.suggestion;
        setForm((f) => {
          const next = { ...f };
          // 빈 필드만 채움 (사용자 입력 보호)
          if (!f.merchant_name && s.merchant_name) next.merchant_name = s.merchant_name;
          if (!f.category_main && s.category_main) next.category_main = s.category_main;
          if (!f.category_sub && s.category_sub) next.category_sub = s.category_sub;
          if (!f.payment_method_id && !f.account_from_id) {
            if (s.payment_method_id) next.payment_method_id = s.payment_method_id;
            else if (s.account_from_id) next.account_from_id = s.account_from_id;
          }
          // 결제자: 결제수단에 주인이 있으면 그 사람이 우선(카드는 쓰는 사람이 정해져 있음),
          //        없으면 과거에 이 가맹점에서 가장 자주 결제한 사람.
          if (!f.member_id) {
            const pmOwner = paymentMethods.find(
              (p) => p.id === (next.payment_method_id ?? f.payment_method_id),
            )?.member_id;
            if (pmOwner) next.member_id = pmOwner;
            else if (s.member_id) next.member_id = s.member_id;
          }
          // 지출 대상: 과거에 가장 자주 쓰인 조합
          if ((!f.target_member_ids || f.target_member_ids.length === 0) && s.target_member_ids?.length) {
            next.target_member_ids = s.target_member_ids;
          }
          return next;
        });
        setSuggestionApplied(`과거 ${s.frequency}회 기록에서 자동 입력`);
      } catch {
        /* skip */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [form.name, form.merchant_name, paymentMethods]);

  // ── 세부 품목 조작 ──
  const addLineItem = () =>
    setLineItems((p) => [
      ...p,
      { id: crypto.randomUUID(), name: '', quantity: 1, price: 0, unit: '개', track: false, category_main: '', category_sub: '' },
    ]);

  const syncAmountFromItems = (items: LineItem[]) => {
    const total = items.filter((i) => i.price > 0).reduce((s, i) => s + i.price, 0);
    touchedRef.current.add('amount');
    setForm((f) => ({ ...f, amount: total }));
  };

  const removeLineItem = (id: string) => {
    const next = lineItems.filter((i) => i.id !== id);
    setLineItems(next);
    if (next.length > 0) syncAmountFromItems(next);
  };

  const updateLineItem = (id: string, field: keyof LineItem, value: any) => {
    const next = lineItems.map((i) => (i.id === id ? { ...i, [field]: value } : i));
    setLineItems(next);
    syncAmountFromItems(next);
  };

  const openLineItems = async () => {
    setShowLineItems((v) => !v);
    if (showLineItems || lineItems.length > 0) return;

    const defaultName = form.merchant_name || form.name || '';
    const sub = (form.category_sub || '').toLowerCase();
    const nameLower = (form.name || '').toLowerCase();
    let defaultUnit = '개';
    if (sub.includes('주유') || nameLower.includes('주유') || nameLower.includes('휘발유') || nameLower.includes('경유')) defaultUnit = 'L';
    else if (nameLower.includes('세제') || nameLower.includes('샴푸') || nameLower.includes('린스')) defaultUnit = 'ml';
    else if (nameLower.includes('쌀') || nameLower.includes('밀가루')) defaultUnit = 'kg';
    else if (nameLower.includes('우유') || nameLower.includes('음료') || nameLower.includes('주스')) defaultUnit = 'L';

    if (defaultName) {
      try {
        const res = await fetch(`/api/items/unit-hint?name=${encodeURIComponent(defaultName)}`);
        const { hint } = await res.json();
        if (hint?.unit) defaultUnit = hint.unit;
      } catch {}
    }
    setLineItems([{ id: crypto.randomUUID(), name: defaultName, quantity: 1, price: 0, unit: defaultUnit, track: false }]);
  };

  // ── 예산 경고 ──
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
    if (rate >= 80) return `${f.category_main} 예산의 ${rate}%에 도달해요 (${formatAmount(budget.amount - alreadySpent)} 남음)`;
    return null;
  };

  // ── 저장 ──
  const handleSave = async () => {
    if (!form.amount || !form.date) return;

    if (!ignoreWarning) {
      const warning = checkBudget(form);
      if (warning) {
        setBudgetWarningMsg(warning);
        return;
      }
    }

    const input: CreateTransactionInput = {
      household_id: process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!,
      member_id: form.member_id,
      target_member_id: form.target_member_id,
      target_member_ids: form.target_member_ids,
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
      raw_input: quickText,
    };

    const tx = await saveTransaction(input);
    if (tx) {
      const validItems = lineItems.filter((i) => i.name.trim() && i.price > 0);
      if (validItems.length > 0) {
        await fetch(`/api/transactions/${tx.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: validItems.map(({ id, ...rest }) => rest) }),
        });
      }
      onSaved();
      if (onSavedWithId && tx?.id) onSavedWithId(tx.id);
      handleClose();
    }
  };

  const handleClose = () => {
    setQuickText('');
    setForm({});
    setParsed(null);
    setShowMore(false);
    setOcrResult(null);
    setListening(false);
    setLineItems([]);
    setShowLineItems(false);
    setSuggestionApplied(null);
    touchedRef.current = new Set();
    if (recognitionRef.current) recognitionRef.current.stop();
    setBudgetWarningMsg(null);
    setIgnoreWarning(false);
    onClose();
  };

  // ── 음성 인식 (저장은 항상 사용자가 직접 누름) ──
  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('이 브라우저는 음성 인식을 지원하지 않아요.');
      return;
    }
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
      setQuickText((prev) => (prev ? prev + ' ' + transcript : transcript));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  // ── OCR ──
  const compressImage = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 1200;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
          else { width = Math.round((width * MAX) / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = url;
    });

  const handleOcrFileRaw = async (file: File) => {
    setOcrLoading(true);
    try {
      const { base64, mimeType } = await compressImage(file);
      const fd = new FormData();
      fd.append('base64', base64);
      fd.append('mimeType', mimeType);
      const res = await fetch('/api/transactions/ocr', { method: 'POST', body: fd });
      const text = await res.text();
      let data: { result?: unknown; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        alert(`서버 응답 파싱 실패 (HTTP ${res.status}). 응답: ${text.slice(0, 200)}`);
        return;
      }
      if (!res.ok) {
        alert(`OCR 실패 (${res.status}): ${data.error ?? '알 수 없는 오류'}`);
        return;
      }
      if (data.result) {
        const r = data.result as { items?: unknown[] };
        if (!r.items || r.items.length === 0) {
          alert('영수증에서 항목을 못 찾았어요. 더 선명한 사진으로 다시 시도해주세요.');
          return;
        }
        setOcrResult(data.result);
      } else {
        alert('영수증을 인식하지 못했어요. 다시 시도해주세요.');
      }
    } catch (e) {
      alert(`OCR 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcrLoading(false);
      if (ocrFileRef.current) ocrFileRef.current.value = '';
    }
  };

  const handleOcrFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleOcrFileRaw(file);
  };

  // OCR 확인 후 등록: 거래 1건 + items 테이블
  const handleOcrConfirm = async (
    items: any[],
    meta: { date: string; payment_method_id: string; account_from_id?: string; member_id: string; saveImage: boolean },
  ) => {
    const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;
    const storeName = ocrResult?.store_name || '마트';
    const total = items.reduce((s: number, i: any) => s + Math.abs(i.amount), 0);

    // 대분류: 금액 가중치로 최빈값
    const mainWeight: Record<string, number> = {};
    items.forEach((i: any) => {
      const k = i.category_main || '기타';
      mainWeight[k] = (mainWeight[k] ?? 0) + Math.abs(i.amount);
    });
    const topCat = Object.entries(mainWeight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '식비';

    // 소분류: topCat에 해당하는 품목 중 금액 가중치로 최빈값
    const subWeight: Record<string, number> = {};
    items
      .filter((i: any) => (i.category_main || '기타') === topCat && i.category_sub)
      .forEach((i: any) => {
        subWeight[i.category_sub] = (subWeight[i.category_sub] ?? 0) + Math.abs(i.amount);
      });
    const topSub = Object.entries(subWeight).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

    // 거래 대표 품목명: 첫 품목 + 외 N건 (가맹점과 별개)
    const representativeName =
      items.length === 1 ? items[0].name : items.length > 1 ? `${items[0].name} 외 ${items.length - 1}건` : '';

    const txRes = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: HOUSEHOLD_ID,
        date: meta.date,
        type: 'variable_expense',
        amount: total,
        name: representativeName,
        merchant_name: storeName,
        category_main: topCat,
        category_sub: topSub,
        payment_method_id: meta.payment_method_id || null,
        account_from_id: meta.account_from_id || null,
        member_id: meta.member_id || null,
        memo: `OCR 등록 (${items.length}개 품목)`,
        input_type: 'receipt',
        receipt_url: meta.saveImage ? (ocrResult?.receipt_url ?? '') : '',
      }),
    });

    if (!txRes.ok) {
      const txt = await txRes.text();
      let errMsg = `HTTP ${txRes.status}`;
      try {
        const j = JSON.parse(txt);
        if (j.error) errMsg = j.error;
      } catch {
        errMsg = txt.slice(0, 200) || errMsg;
      }
      alert(`저장 실패: ${errMsg}`);
      return;
    }
    const { transaction } = await txRes.json();

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
          category_sub: item.category_sub || '',
          track: !!item.track,
        })),
      }),
    });

    setOcrResult(null);
    onSaved();
    if (onSavedWithId && transaction?.id) onSavedWithId(transaction.id);
    handleClose();
  };

  if (!open) return null;

  // 모달 밖에 배치 - 안드로이드 input 트리거 문제 방지.
  // capture 속성을 빼면 모바일이 '카메라 / 사진첩' 선택창을 직접 띄워준다.
  const fileInputs = (
    <input id="ocr-image-input" ref={ocrFileRef} type="file" accept="image/*" onChange={handleOcrFile} className="hidden" />
  );

  if (ocrResult) {
    return (
      <OcrReviewSheet
        result={ocrResult}
        paymentMethods={paymentMethods}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        members={members}
        onConfirm={handleOcrConfirm}
        onClose={() => setOcrResult(null)}
      />
    );
  }

  // 현재 탭 (고정지출은 '지출' 탭 + 자물쇠 토글로 표현)
  const tab: TabKey =
    form.type === 'income' ? 'income' : form.type === 'transfer' ? 'transfer' : 'expense';
  const isFixed = form.type === 'fixed_expense';
  const isExpense = tab === 'expense';

  const setTab = (t: TabKey) => {
    touchedRef.current.add('type');
    setForm((f) => ({
      ...f,
      type: t === 'income' ? 'income' : t === 'transfer' ? 'transfer' : isFixed ? 'fixed_expense' : 'variable_expense',
    }));
  };

  const itemsTotal = lineItems.filter((i) => i.price > 0).reduce((s, i) => s + i.price, 0);
  const amountLocked = itemsTotal > 0;
  const validItemCount = lineItems.filter((i) => i.name.trim() && i.price > 0).length;

  return (
    <>
      {fileInputs}
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
        <div className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[92vh]">
          {/* 핸들 */}
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 py-2 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900">거래 입력</h2>
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200">
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <div className="px-5 pb-6 space-y-3.5 overflow-y-auto flex-1">
            {/* ── 빠른 입력칸: 말하듯 쓰면 아래가 자동으로 채워짐 ── */}
            <div className="relative">
              <input
                type="text"
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                placeholder="스타벅스 4500 카드"
                autoFocus
                className="w-full border border-indigo-200 bg-indigo-50/50 rounded-2xl pl-4 pr-24 py-3.5 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <label
                  htmlFor="ocr-image-input"
                  className="w-9 h-9 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 active:bg-gray-100 cursor-pointer"
                  title="영수증 촬영 / 사진첩"
                >
                  <Camera size={16} />
                </label>
                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    listening ? 'bg-rose-500 text-white animate-pulse' : 'bg-white border border-gray-200 text-gray-500 active:bg-gray-100'
                  }`}
                  title="음성 입력"
                >
                  {listening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              </div>
            </div>

            {listening ? (
              <p className="text-xs text-rose-500 text-center flex items-center justify-center gap-1">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" /> 듣고 있어요...
              </p>
            ) : ocrLoading ? (
              <p className="text-xs text-indigo-500 text-center flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                영수증 분석 중...
              </p>
            ) : (
              <p className="text-xs text-gray-400 text-center">
                말하듯 쓰면 아래가 자동으로 채워져요 · 📷 영수증 · 🎤 음성
              </p>
            )}

            {/* ── 금액 ── */}
            <div className="text-center pt-1">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                readOnly={amountLocked}
                value={form.amount ? form.amount.toLocaleString() : ''}
                onChange={(e) => {
                  if (amountLocked) return;
                  const v = parseInt(e.target.value.replace(/[^0-9]/g, ''));
                  setField('amount', isNaN(v) ? undefined : v);
                }}
                className={`text-4xl font-bold text-center w-full border-b-2 outline-none pb-1 ${
                  amountLocked ? 'border-indigo-200 text-indigo-500' : 'border-indigo-400 text-gray-900'
                }`}
              />
              <p className="text-xs mt-1 h-4">
                {amountLocked ? (
                  <span className="text-indigo-400">품목 합계 자동계산</span>
                ) : parsed?.confidence === 'low' && quickText.trim() ? (
                  <span className="text-amber-500">금액을 확인해주세요</span>
                ) : (
                  <span className="text-gray-300">원</span>
                )}
              </p>
            </div>

            {/* ── 유형 탭 (+ 고정지출 토글) ── */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                      tab === t.key ? 'bg-white shadow text-indigo-600' : 'text-gray-500'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {isExpense && (
                <button
                  onClick={() => {
                    touchedRef.current.add('type');
                    setForm((f) => ({ ...f, type: isFixed ? 'variable_expense' : 'fixed_expense' }));
                  }}
                  className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    isFixed ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-400 border-gray-200'
                  }`}
                  title="매달 반복되는 지출(통신비·보험료 등)이면 켜세요"
                >
                  <Lock size={12} /> 고정
                </button>
              )}
            </div>

            {/* ── 기본 필드 ── */}
            <div className="space-y-2.5">
              <Row label={tab === 'income' ? '무엇' : '어디서/무엇'}>
                <input
                  type="text"
                  value={form.name ?? ''}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={tab === 'income' ? '예: 4월 월급' : '예: 스타벅스'}
                  className={INPUT_CLS}
                />
              </Row>

              <Row label="분류">
                <div className="grid grid-cols-2 gap-2">
                  <CategoryCombobox
                    value={form.category_main ?? ''}
                    onChange={(v) => {
                      touchedRef.current.add('category_main');
                      touchedRef.current.add('category_sub');
                      setForm((f) => ({ ...f, category_main: v, category_sub: '' }));
                    }}
                    options={allMainCategories as unknown as string[]}
                    placeholder="대분류"
                    onAddOption={handleAddMainCategory}
                  />
                  <CategoryCombobox
                    value={form.category_sub ?? ''}
                    onChange={(v) => setField('category_sub', v)}
                    options={getSubOptions(form.category_main ?? '')}
                    placeholder="소분류"
                    disabled={!form.category_main}
                    onAddOption={form.category_main ? handleAddSubCategory : undefined}
                  />
                </div>
              </Row>

              {/* 수입: 입금 계좌 */}
              {tab === 'income' && (
                <Row label="입금">
                  <select
                    value={form.account_to_id ?? ''}
                    onChange={(e) => setField('account_to_id', e.target.value || undefined)}
                    className={`${INPUT_CLS} bg-white`}
                  >
                    <option value="">계좌 선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </Row>
              )}

              {/* 이동: 출금 → 입금 */}
              {tab === 'transfer' && (
                <>
                  <Row label="출금">
                    <select
                      value={form.account_from_id ?? ''}
                      onChange={(e) => setField('account_from_id', e.target.value || undefined)}
                      className={`${INPUT_CLS} bg-white`}
                    >
                      <option value="">계좌 선택</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </Row>
                  <Row label="입금">
                    <select
                      value={form.account_to_id ?? ''}
                      onChange={(e) => setField('account_to_id', e.target.value || undefined)}
                      className={`${INPUT_CLS} bg-white`}
                    >
                      <option value="">계좌 선택</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </Row>
                </>
              )}

              {/* 지출: 결제수단 */}
              {isExpense && (
                <Row label="결제">
                  <select
                    value={form.payment_method_id ?? (form.account_from_id ? `account:${form.account_from_id}` : '')}
                    onChange={(e) => {
                      const val = e.target.value;
                      touchedRef.current.add('payment_method_id');
                      touchedRef.current.add('account_from_id');
                      if (val.startsWith('account:')) {
                        setForm((f) => ({ ...f, payment_method_id: undefined, account_from_id: val.replace('account:', '') }));
                      } else {
                        // 결제수단에 주인이 지정돼 있으면 결제자를 자동으로 맞춘다.
                        // 카드마다 쓰는 사람이 정해져 있어 매번 고르는 게 번거롭다는 피드백 반영.
                        const pm = paymentMethods.find((p) => p.id === val);
                        setForm((f) => ({
                          ...f,
                          payment_method_id: val || undefined,
                          account_from_id: undefined,
                          member_id: pm?.member_id ?? f.member_id,
                        }));
                      }
                    }}
                    className={`${INPUT_CLS} bg-white`}
                  >
                    <option value="">선택 안함</option>
                    {(() => {
                      const memberId = form.member_id;
                      const mine = memberId ? paymentMethods.filter((pm) => pm.member_id === memberId) : [];
                      const shared = paymentMethods.filter((pm) => !pm.member_id);
                      const others = memberId ? paymentMethods.filter((pm) => pm.member_id && pm.member_id !== memberId) : [];
                      // optgroup 모바일 호환성 문제로 emoji prefix 사용
                      const ordered = memberId ? [...mine, ...shared, ...others] : paymentMethods;
                      return (
                        <>
                          {ordered.map((pm) => (
                            <option key={pm.id} value={pm.id}>💳 {pm.name}</option>
                          ))}
                          {accounts.map((acc) => (
                            <option key={acc.id} value={`account:${acc.id}`}>🏦 {acc.name} (직접출금)</option>
                          ))}
                        </>
                      );
                    })()}
                  </select>
                </Row>
              )}

              {/* 계좌이체 결제수단이면 출금 계좌 지정 */}
              {isExpense && paymentMethods.find((pm) => pm.id === form.payment_method_id)?.type === 'bank_transfer' && (
                <Row label="출금">
                  <select
                    value={form.account_from_id ?? ''}
                    onChange={(e) => setField('account_from_id', e.target.value || undefined)}
                    className={`${INPUT_CLS} bg-white`}
                  >
                    <option value="">계좌 선택</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </Row>
              )}

              {suggestionApplied && (
                <p className="text-[11px] text-indigo-500 pl-[76px]">✨ {suggestionApplied}</p>
              )}
            </div>

            {/* ── 자세히 (접힘) ── */}
            <div className="border-t border-gray-100 pt-2">
              <button
                onClick={() => setShowMore((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-2 text-sm text-gray-500 font-medium"
              >
                {showMore ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                자세히
                <span className="text-xs text-gray-300">
                  (날짜{members.length > 1 ? '·구성원' : ''}{isExpense ? '·품목' : ''}·메모)
                </span>
                {validItemCount > 0 && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">
                    품목 {validItemCount}
                  </span>
                )}
              </button>

              {showMore && (
                <div className="space-y-2.5 pt-1 pb-1">
                  <Row label="날짜">
                    <input
                      type="date"
                      value={form.date ?? dayjs().format('YYYY-MM-DD')}
                      onChange={(e) => setField('date', e.target.value)}
                      className={INPUT_CLS}
                    />
                  </Row>

                  <Row label={tab === 'income' ? '지급처' : '가맹점'}>
                    <input
                      type="text"
                      value={form.merchant_name ?? ''}
                      onChange={(e) => setField('merchant_name', e.target.value)}
                      placeholder={tab === 'income' ? '회사/은행 (선택)' : '가게 이름을 따로 남길 때 (선택)'}
                      className={INPUT_CLS}
                    />
                  </Row>

                  <Row label="메모">
                    <input
                      type="text"
                      value={form.memo ?? ''}
                      onChange={(e) => setField('memo', e.target.value)}
                      placeholder="추가 메모 (선택)"
                      className={INPUT_CLS}
                    />
                  </Row>

                  {/* 지출 대상 (결제자는 결제수단 주인으로 자동 지정되므로 고르지 않는다) */}
                  {members.length > 1 && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                      {form.member_id && (
                        <p className="text-xs text-gray-400">
                          💳 결제자 · {members.find((m) => m.id === form.member_id)?.name ?? ''}
                          <span className="text-gray-300"> (결제수단 주인)</span>
                        </p>
                      )}
                      <div>
                        <label className="text-xs font-medium mb-2 block text-gray-500">
                          🎯 지출 대상 <span className="text-gray-300">(공용 또는 특정 인원)</span>
                        </label>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => {
                              touchedRef.current.add('target_member_ids');
                              setForm((f) => ({ ...f, target_member_id: undefined, target_member_ids: [] }));
                            }}
                            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                              !form.target_member_ids?.length
                                ? 'bg-slate-600 text-white border-transparent'
                                : 'bg-white border-gray-200 text-gray-500'
                            }`}
                            title="가족 모두를 위한 지출 (식자재, 관리비 등)"
                          >
                            🏠 공용
                          </button>
                          {members.map((m) => {
                            const selected = (form.target_member_ids ?? []).includes(m.id);
                            return (
                              <button
                                key={m.id}
                                onClick={() => {
                                  touchedRef.current.add('target_member_ids');
                                  setForm((f) => {
                                    const cur = f.target_member_ids ?? [];
                                    const next = selected ? cur.filter((id) => id !== m.id) : [...cur, m.id];
                                    return { ...f, target_member_ids: next, target_member_id: next[0] };
                                  });
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                                  selected ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                                }`}
                                style={selected ? { backgroundColor: m.color, borderColor: m.color } : {}}
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: selected ? 'rgba(255,255,255,0.8)' : m.color }}
                                />
                                {m.name}
                                {selected && <span className="text-[11px] ml-0.5">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 세부 품목 */}
                  {isExpense && (
                    <div>
                      <button
                        type="button"
                        onClick={openLineItems}
                        className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 active:bg-gray-100"
                      >
                        <span className="flex items-center gap-2">
                          <Package size={14} className="text-indigo-400" />
                          <span className="font-medium">세부 품목</span>
                          {validItemCount > 0 && (
                            <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                              {validItemCount}개
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">{showLineItems ? '닫기' : '단가 분석용'}</span>
                      </button>

                      {showLineItems && (
                        <div className="mt-2 bg-gray-50 rounded-xl p-3 space-y-2">
                          <p className="text-xs text-gray-400 mb-1">
                            품목명에 용량 포함 (예: 맥주 500ml) · 단위는 구매단위 (캔/개 등)
                          </p>
                          {lineItems.map((item) => {
                            const unitPrice = item.quantity > 1 && item.price > 0 ? Math.round(item.price / item.quantity) : null;
                            return (
                              <div key={item.id} className="bg-white rounded-xl border border-gray-100 overflow-visible">
                                <div className="flex items-center gap-2 px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => updateLineItem(item.id, 'name', e.target.value)}
                                    placeholder="품목명 (예: 비엔나 소세지)"
                                    className="flex-1 text-sm border-0 outline-none bg-transparent placeholder-gray-300"
                                  />
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={item.price || ''}
                                    onChange={(e) => updateLineItem(item.id, 'price', parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                                    placeholder="금액"
                                    className="w-20 text-right text-sm border-0 outline-none bg-transparent placeholder-gray-300"
                                  />
                                  <span className="text-xs text-gray-400 flex-shrink-0">원</span>
                                  <button onClick={() => removeLineItem(item.id)} className="p-1 text-gray-300 hover:text-rose-400 flex-shrink-0">
                                    <X size={13} />
                                  </button>
                                </div>
                                <div className="px-3 pb-2 border-t border-gray-50 pt-2 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 w-8 flex-shrink-0">수량</span>
                                    <div className="flex items-center gap-1 border border-gray-200 rounded-lg overflow-hidden">
                                      <button
                                        onClick={() => updateLineItem(item.id, 'quantity', Math.max(0.01, +(item.quantity - 1).toFixed(2)))}
                                        className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                                      >
                                        <Minus size={11} />
                                      </button>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const raw = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                                          updateLineItem(item.id, 'quantity', raw === '' || raw === '.' ? 1 : parseFloat(raw));
                                        }}
                                        onFocus={(e) => e.target.select()}
                                        className="w-14 text-center text-sm py-1 focus:outline-none"
                                      />
                                      <button
                                        onClick={() => updateLineItem(item.id, 'quantity', +(item.quantity + 1).toFixed(2))}
                                        className="px-2 py-1 text-gray-500 hover:bg-gray-100"
                                      >
                                        <Plus size={11} />
                                      </button>
                                    </div>
                                    {unitPrice && (
                                      <p className="text-xs text-indigo-500 font-medium ml-auto">
                                        {unitPrice.toLocaleString()}원/{item.unit}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400 w-8 flex-shrink-0">단위</span>
                                    <input
                                      type="text"
                                      value={item.unit}
                                      onChange={(e) => updateLineItem(item.id, 'unit', e.target.value)}
                                      placeholder="개, 300g, 500ml, 캔 ..."
                                      className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                    />
                                  </div>
                                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-gray-500">
                                    <input
                                      type="checkbox"
                                      checked={item.track}
                                      onChange={(e) => updateLineItem(item.id, 'track', e.target.checked)}
                                      className="rounded border-gray-300 accent-indigo-500"
                                    />
                                    <span>📊 품목 추적에 추가</span>
                                  </label>
                                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                                    <CategoryCombobox
                                      value={item.category_main ?? ''}
                                      onChange={(v) => {
                                        setLineItems((prev) =>
                                          prev.map((li) => (li.id === item.id ? { ...li, category_main: v, category_sub: '' } : li)),
                                        );
                                      }}
                                      options={allMainCategories as unknown as string[]}
                                      placeholder="분류 (선택)"
                                      onAddOption={handleAddMainCategory}
                                    />
                                    <CategoryCombobox
                                      value={item.category_sub ?? ''}
                                      onChange={(v) => updateLineItem(item.id, 'category_sub', v)}
                                      options={getSubOptions(item.category_main ?? '')}
                                      placeholder="소분류"
                                      disabled={!item.category_main}
                                      onAddOption={item.category_main ? handleAddSubCategory : undefined}
                                    />
                                  </div>
                                </div>
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
                            <p className="text-xs text-gray-400 text-right">합계 {itemsTotal.toLocaleString()}원</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 참고 자료 */}
                  <ReceiptAttachment
                    value={form.receipt_url ?? ''}
                    onChange={(url) => setField('receipt_url', url)}
                  />
                </div>
              )}
            </div>

            {/* 예산 경고 */}
            {budgetWarningMsg && !ignoreWarning && (
              <div
                className={`rounded-xl p-3 space-y-2 ${
                  budgetWarningMsg.includes('초과') ? 'bg-rose-50 border border-rose-200' : 'bg-amber-50 border border-amber-200'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle
                    size={16}
                    className={budgetWarningMsg.includes('초과') ? 'text-rose-500 flex-shrink-0 mt-0.5' : 'text-amber-500 flex-shrink-0 mt-0.5'}
                  />
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
                    className={`flex-1 py-2 text-xs font-medium text-white rounded-xl ${
                      budgetWarningMsg.includes('초과') ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
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

            {/* 저장 */}
            <button
              onClick={handleSave}
              disabled={!form.amount || saving}
              className="w-full py-4 bg-indigo-600 text-white font-bold text-base rounded-2xl active:bg-indigo-700 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <><CheckCircle size={18} /> 저장하기</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
