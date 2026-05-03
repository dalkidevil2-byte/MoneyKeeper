'use client';
import type { ArchiveProperty } from '@/types';
import { Star, ArrowUpDown } from 'lucide-react';

interface Props {
  schema: ArchiveProperty[];
  filters: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  sortBy: { key: string; dir: 'asc' | 'desc' } | null;
  onSortChange: (s: { key: string; dir: 'asc' | 'desc' } | null) => void;
  onClear: () => void;
}

export default function FilterPanel({
  schema,
  filters,
  onChange,
  sortBy,
  onSortChange,
  onClear,
}: Props) {
  const setOne = (key: string, value: unknown) => {
    const next = { ...filters };
    if (value == null) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  const filterableProps = schema.filter((p) =>
    ['select', 'multiselect', 'rating', 'checkbox', 'date', 'number', 'currency'].includes(
      p.type,
    ),
  );

  const sortableProps = schema.filter((p) =>
    ['text', 'number', 'currency', 'rating', 'date'].includes(p.type),
  );

  return (
    <div className="bg-violet-50 rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-violet-700">🔍 필터 / 정렬</div>
        <button
          onClick={onClear}
          className="text-[11px] text-gray-500 hover:text-rose-500"
        >
          모두 초기화
        </button>
      </div>

      {/* 필터 영역 */}
      <div className="space-y-2.5">
        {filterableProps.map((p) => (
          <div key={p.key}>
            <div className="text-[11px] font-semibold text-gray-600 mb-1">
              {p.label}
            </div>
            <PropertyFilter
              prop={p}
              value={filters[p.key]}
              onChange={(v) => setOne(p.key, v)}
            />
          </div>
        ))}
      </div>

      {/* 정렬 */}
      {sortableProps.length > 0 && (
        <div className="border-t border-violet-200 pt-2.5">
          <div className="text-[11px] font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
            <ArrowUpDown size={11} /> 정렬
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => onSortChange(null)}
              className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                !sortBy
                  ? 'bg-violet-600 text-white'
                  : 'bg-white text-gray-600 border border-violet-200'
              }`}
            >
              기본
            </button>
            {sortableProps.map((p) => {
              const isActive = sortBy?.key === p.key;
              const dir = isActive ? sortBy!.dir : 'desc';
              return (
                <button
                  key={p.key}
                  onClick={() => {
                    if (!isActive) {
                      onSortChange({ key: p.key, dir: 'desc' });
                    } else if (dir === 'desc') {
                      onSortChange({ key: p.key, dir: 'asc' });
                    } else {
                      onSortChange(null);
                    }
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1 ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'bg-white text-gray-600 border border-violet-200'
                  }`}
                >
                  {p.label} {isActive && (dir === 'desc' ? '↓' : '↑')}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyFilter({
  prop,
  value,
  onChange,
}: {
  prop: ArchiveProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (prop.type) {
    case 'select': {
      const opts = (prop.options ?? []) as string[];
      return (
        <div className="flex flex-wrap gap-1">
          <FilterChip
            active={!value}
            onClick={() => onChange(undefined)}
            label="전체"
          />
          {opts.map((o) => (
            <FilterChip
              key={o}
              active={value === o}
              onClick={() => onChange(value === o ? undefined : o)}
              label={o}
            />
          ))}
        </div>
      );
    }
    case 'multiselect': {
      const opts = (prop.options ?? []) as string[];
      const arr = (Array.isArray(value) ? value : []) as string[];
      return (
        <div className="flex flex-wrap gap-1">
          {opts.map((o) => (
            <FilterChip
              key={o}
              active={arr.includes(o)}
              onClick={() => {
                const next = arr.includes(o)
                  ? arr.filter((x) => x !== o)
                  : [...arr, o];
                onChange(next.length ? next : undefined);
              }}
              label={o}
            />
          ))}
        </div>
      );
    }
    case 'rating': {
      const min = Number(value) || 0;
      return (
        <div className="flex flex-wrap gap-1 items-center">
          <FilterChip
            active={min === 0}
            onClick={() => onChange(undefined)}
            label="전체"
          />
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => onChange(min === n ? undefined : n)}
              className={`text-[11px] px-2 py-1 rounded-full font-semibold inline-flex items-center gap-0.5 ${
                min === n
                  ? 'bg-amber-400 text-white'
                  : 'bg-white text-gray-600 border border-violet-200'
              }`}
            >
              <Star size={10} className="fill-current" />
              {n}+
            </button>
          ))}
        </div>
      );
    }
    case 'checkbox': {
      return (
        <div className="flex gap-1">
          <FilterChip
            active={!value}
            onClick={() => onChange(undefined)}
            label="전체"
          />
          <FilterChip
            active={value === 'on'}
            onClick={() => onChange(value === 'on' ? undefined : 'on')}
            label="✓ 체크됨"
          />
          <FilterChip
            active={value === 'off'}
            onClick={() => onChange(value === 'off' ? undefined : 'off')}
            label="✗ 미체크"
          />
        </div>
      );
    }
    case 'date': {
      const range = (value as { from?: string; to?: string }) ?? {};
      return (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={range.from ?? ''}
            onChange={(e) => {
              const next = { ...range, from: e.target.value || undefined };
              onChange(
                next.from || next.to ? next : undefined,
              );
            }}
            className="flex-1 px-2 py-1 text-xs bg-white border border-violet-200 rounded-md"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="date"
            value={range.to ?? ''}
            onChange={(e) => {
              const next = { ...range, to: e.target.value || undefined };
              onChange(
                next.from || next.to ? next : undefined,
              );
            }}
            className="flex-1 px-2 py-1 text-xs bg-white border border-violet-200 rounded-md"
          />
        </div>
      );
    }
    case 'number':
    case 'currency': {
      const range = (value as { min?: number; max?: number }) ?? {};
      return (
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={range.min ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              const next = { ...range, min: v };
              onChange(next.min != null || next.max != null ? next : undefined);
            }}
            placeholder="이상"
            className="flex-1 px-2 py-1 text-xs bg-white border border-violet-200 rounded-md"
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="number"
            value={range.max ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? undefined : Number(e.target.value);
              const next = { ...range, max: v };
              onChange(next.min != null || next.max != null ? next : undefined);
            }}
            placeholder="이하"
            className="flex-1 px-2 py-1 text-xs bg-white border border-violet-200 rounded-md"
          />
        </div>
      );
    }
    default:
      return null;
  }
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${
        active
          ? 'bg-violet-600 text-white'
          : 'bg-white text-gray-600 border border-violet-200'
      }`}
    >
      {label}
    </button>
  );
}
