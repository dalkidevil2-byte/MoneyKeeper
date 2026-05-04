'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Camera, Loader2 } from 'lucide-react';

interface Item {
  name: string;
  amount?: number;
  count?: number;
  unitPrice?: number;
  price?: number;
}

interface Result {
  store_name?: string;
  storeName?: string;
  date?: string;
  total?: number;
  items: Item[];
  paymentMethod?: string;
}

export default function OcrTestPage() {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clovaConfigured, setClovaConfigured] = useState(true);
  const [clovaResult, setClovaResult] = useState<Result | null>(null);
  const [gptResult, setGptResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [clovaMs, setClovaMs] = useState(0);
  const [gptMs, setGptMs] = useState(0);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    setError(null);
    setClovaResult(null);
    setGptResult(null);
    try {
      const compressed = await compressImage(file, 1600, 0.85);
      const fd = new FormData();
      fd.append('file', compressed, 'receipt.jpg');
      const t0 = Date.now();
      const res = await fetch('/api/transactions/ocr-compare', {
        method: 'POST',
        body: fd,
      });
      const elapsed = Date.now() - t0;
      const text = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`서버 응답 파싱 실패: ${text.slice(0, 200)}`);
      }
      if (!res.ok) throw new Error((json.error as string) ?? `HTTP ${res.status}`);
      setClovaConfigured(json.clova_configured as boolean);
      setClovaResult(json.clova as Result | null);
      setGptResult(json.gpt as Result | null);
      setClovaMs(elapsed);
      setGptMs(elapsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 이미지 리사이즈 + JPEG 압축 (긴 변 maxSize 픽셀로 축소).
   * 카메라 원본은 4MB 이상이라 Vercel/CLOVA 가 거부 → 1600px JPEG q0.85 ≈ 300KB.
   */
  const compressImage = async (file: File, maxSize: number, quality: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas context 실패'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('blob 변환 실패'));
          },
          'image/jpeg',
          quality,
        );
      };
      img.onerror = () => reject(new Error('이미지 로드 실패'));
      img.src = URL.createObjectURL(file);
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/transactions" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-base font-bold text-gray-900">OCR 비교 테스트</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-700 mb-2">
            영수증 1장 업로드 → CLOVA + gpt-4o 동시 실행해서 비교
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-6 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 text-indigo-700 font-semibold inline-flex items-center justify-center gap-2"
          >
            <Camera size={18} /> 영수증 이미지 선택
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onFile}
            className="hidden"
          />
          {!clovaConfigured && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 p-2 rounded-lg">
              ⚠️ CLOVA 환경변수 미설정 — gpt-4o 결과만 표시됨
            </div>
          )}
        </div>

        {previewUrl && (
          <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt="receipt"
              className="w-full max-h-80 object-contain rounded-xl"
            />
          </div>
        )}

        {busy && (
          <div className="flex justify-center items-center py-8 gap-2 text-gray-500 text-sm">
            <Loader2 size={20} className="animate-spin" /> 두 OCR 동시 실행 중…
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
            {error}
          </div>
        )}

        {(clovaResult || gptResult) && !busy && (
          <div className="grid sm:grid-cols-2 gap-3">
            <ResultCard
              title="🟢 CLOVA OCR"
              result={clovaResult}
              elapsed={clovaMs}
              fallback="결과 없음"
            />
            <ResultCard
              title="🔵 gpt-4o vision"
              result={gptResult}
              elapsed={gptMs}
              fallback="결과 없음"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  title,
  result,
  elapsed,
  fallback,
}: {
  title: string;
  result: Result | null;
  elapsed: number;
  fallback: string;
}) {
  if (!result) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="text-sm font-bold text-gray-900 mb-2">{title}</div>
        <div className="text-sm text-gray-400">{fallback}</div>
      </div>
    );
  }
  const storeName = result.storeName ?? result.store_name ?? '';
  const items = result.items ?? [];
  const total = result.total ?? items.reduce((s, i) => s + (i.amount ?? i.price ?? 0), 0);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-bold text-gray-900">{title}</div>
        {elapsed > 0 && (
          <div className="text-[10px] text-gray-400">{elapsed}ms</div>
        )}
      </div>
      <div className="space-y-1 text-xs">
        <div>
          <span className="text-gray-500">가게명:</span>{' '}
          <span className="font-semibold">{storeName || '-'}</span>
        </div>
        <div>
          <span className="text-gray-500">날짜:</span>{' '}
          <span className="font-semibold">{result.date || '-'}</span>
        </div>
        <div>
          <span className="text-gray-500">합계:</span>{' '}
          <span className="font-semibold">
            {total ? total.toLocaleString('ko-KR') + '원' : '-'}
          </span>
        </div>
        {result.paymentMethod && (
          <div>
            <span className="text-gray-500">결제:</span>{' '}
            <span className="font-semibold">{result.paymentMethod}</span>
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-gray-100 pt-2">
        <div className="text-[11px] font-semibold text-gray-500 mb-1">
          📋 품목 {items.length}개
        </div>
        <ul className="space-y-1 text-[11px] max-h-80 overflow-y-auto">
          {items.map((it, i) => {
            const amount = it.amount ?? it.price ?? 0;
            return (
              <li
                key={i}
                className="flex justify-between gap-2 py-1 border-b border-gray-50 last:border-0"
              >
                <span className="truncate">{it.name}</span>
                <span className="text-gray-700 shrink-0">
                  {amount.toLocaleString('ko-KR')}원
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
