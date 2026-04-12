'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Check, ChevronDown } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  onAddOption?: (value: string) => Promise<void>;
}

export default function CategoryCombobox({ value, onChange, options, placeholder = '선택', disabled, onAddOption }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));
  const canAdd = onAddOption && query.trim() && !options.some((o) => o === query.trim());

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAdd = async () => {
    if (!onAddOption || !query.trim()) return;
    setAdding(true);
    await onAddOption(query.trim());
    onChange(query.trim());
    setOpen(false);
    setAdding(false);
  };

  const handleSelect = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none transition-colors ${
          disabled ? 'opacity-40 cursor-not-allowed border-gray-200' : 'border-gray-200 hover:border-indigo-300'
        } ${open ? 'border-indigo-400 ring-2 ring-indigo-100' : ''}`}
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value || placeholder}</span>
        <ChevronDown size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {/* 검색 입력 */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) handleAdd();
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder="검색 또는 추가..."
              className="w-full text-sm px-2 py-1.5 rounded-lg bg-gray-50 focus:outline-none focus:bg-indigo-50 placeholder-gray-400"
            />
          </div>

          {/* 옵션 목록 */}
          <div className="max-h-48 overflow-y-auto">
            {/* 선택 안함 */}
            {!query && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 flex items-center justify-between"
              >
                선택 안함
                {!value && <Check size={13} className="text-indigo-500" />}
              </button>
            )}

            {/* 필터된 옵션 */}
            {filtered.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleSelect(opt)}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 flex items-center justify-between"
              >
                {opt}
                {value === opt && <Check size={13} className="text-indigo-500" />}
              </button>
            ))}

            {/* 검색 결과 없음 */}
            {query && filtered.length === 0 && !canAdd && (
              <p className="px-3 py-2 text-xs text-gray-400">일치하는 항목 없음</p>
            )}

            {/* 새 항목 추가 */}
            {canAdd && (
              <button
                type="button"
                onClick={handleAdd}
                disabled={adding}
                className="w-full text-left px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-t border-gray-100"
              >
                <Plus size={13} />
                {adding ? '추가 중...' : <><span className="font-medium">"{query.trim()}"</span> 추가</>}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
