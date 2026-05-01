'use client';

import { Star } from 'lucide-react';
import type { ArchiveProperty } from '@/types';

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
    default:
      return String(value);
  }
}
