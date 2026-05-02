'use client';

import { Star, Paperclip, X, Loader2, FileText, ImageIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { ArchiveProperty } from '@/types';
import { compressImageIfPossible } from '@/lib/compress-image';

type FileItem = { url: string; name: string; type?: string; size?: number };

function FilesInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: FileItem[]) => void;
}) {
  const list: FileItem[] = Array.isArray(value)
    ? (value as FileItem[]).filter((x) => x && typeof x === 'object' && 'url' in x)
    : [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const next = [...list];
    try {
      for (const raw of Array.from(files)) {
        // 이미지면 클라이언트 압축 (긴 변 1920px / JPEG 82%)
        const f = await compressImageIfPossible(raw);
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch('/api/archive/upload', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? '업로드 실패');
        next.push({ url: j.url, name: j.name, type: j.type, size: j.size });
      }
      onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (idx: number) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {list.map((f, i) => {
            const isImage =
              (f.type ?? '').startsWith('image/') ||
              /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(f.name ?? f.url);
            return (
              <div
                key={i}
                className="relative rounded-lg border border-gray-200 bg-gray-50 overflow-hidden aspect-square"
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <img
                      src={f.url}
                      alt={f.name}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex flex-col items-center justify-center h-full p-2 text-center"
                  >
                    <FileText size={20} className="text-gray-500 mb-1" />
                    <span className="text-[10px] text-gray-600 truncate max-w-full px-1">
                      {f.name}
                    </span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white inline-flex items-center justify-center"
                  aria-label="제거"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full py-2.5 rounded-xl border border-dashed border-violet-300 text-violet-600 text-xs font-semibold inline-flex items-center justify-center gap-1 active:bg-violet-50 disabled:opacity-50"
      >
        {busy ? (
          <><Loader2 size={12} className="animate-spin" /> 업로드 중…</>
        ) : (
          <><Paperclip size={12} /> {list.length === 0 ? '파일 / 사진 추가' : '추가'}</>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={(e) => upload(e.target.files)}
        className="hidden"
      />
      {error && (
        <div className="text-[11px] text-rose-500 px-1">{error}</div>
      )}
    </div>
  );
}

void ImageIcon;

interface Props {
  prop: ArchiveProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}

export default function PropertyInput({ prop, value, onChange }: Props) {
  const v = value;

  switch (prop.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
        />
      );
    case 'longtext':
      return (
        <textarea
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 resize-none"
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={(v as number) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
        />
      );
    case 'currency':
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={(v as number) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
            placeholder="0"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
          />
          <span className="text-xs text-gray-500">원</span>
        </div>
      );
    case 'date':
      return (
        <input
          type="date"
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
        />
      );
    case 'url':
      return (
        <input
          type="url"
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400"
        />
      );
    case 'select':
      return (
        <select
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white"
        >
          <option value="">선택 안 함</option>
          {(prop.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case 'multiselect': {
      const selected = (Array.isArray(v) ? v : []) as string[];
      const toggle = (o: string) => {
        if (selected.includes(o)) onChange(selected.filter((x) => x !== o));
        else onChange([...selected, o]);
      };
      return (
        <div className="flex flex-wrap gap-1.5">
          {(prop.options ?? []).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`text-xs px-2 py-1 rounded-full border ${
                selected.includes(o)
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-gray-200 text-gray-600'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      );
    }
    case 'rating': {
      const rating = (v as number) ?? 0;
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(rating === n ? 0 : n)}
              className="p-1"
            >
              <Star
                size={22}
                className={rating >= n ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
              />
            </button>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!v}
            onChange={(e) => onChange(e.target.checked)}
            className="w-5 h-5 accent-violet-600"
          />
          <span className="text-sm text-gray-600">{v ? '예' : '아니오'}</span>
        </label>
      );
    case 'files':
      return <FilesInput value={v} onChange={onChange} />;
    default:
      return (
        <input
          type="text"
          value={(v as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
        />
      );
  }
}

/** 표시용 — 컬렉션 항목 카드에서 짧게 노출 */
export function formatPropertyDisplay(prop: ArchiveProperty, value: unknown): string {
  if (value == null || value === '') return '';
  switch (prop.type) {
    case 'currency':
      return `${(value as number).toLocaleString('ko-KR')}원`;
    case 'rating': {
      const n = value as number;
      return '⭐'.repeat(Math.max(0, Math.min(5, n)));
    }
    case 'multiselect':
      return Array.isArray(value) ? (value as string[]).join(', ') : '';
    case 'checkbox':
      return value ? '✅' : '';
    case 'longtext': {
      const s = String(value);
      return s.length > 60 ? s.slice(0, 60) + '…' : s;
    }
    case 'files': {
      const arr = Array.isArray(value) ? (value as Array<{ name?: string }>) : [];
      if (arr.length === 0) return '';
      return `📎 ${arr.length}개`;
    }
    default:
      return String(value);
  }
}
