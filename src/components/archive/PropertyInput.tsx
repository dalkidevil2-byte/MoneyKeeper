'use client';

import { Star, Paperclip, X, Loader2, FileText, ImageIcon, Check, Plus, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
void GripVertical;

// ─── 체크리스트 ─────────────────────────────────
type ChecklistItem = { label: string; done: boolean; note?: string };

/**
 * Google Keep 스타일 체크리스트:
 * - 매 행 = 체크박스 + 인라인 편집
 * - Enter: 새 행 자동 생성 + 포커스 이동
 * - Backspace (빈 행): 그 행 삭제 + 위 행으로 포커스
 * - 항상 마지막에 빈 "+ 항목 추가" 행이 있어서 누르면 입력 시작
 */
function ChecklistInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (v: ChecklistItem[]) => void;
}) {
  const items: ChecklistItem[] = Array.isArray(value)
    ? (value as ChecklistItem[]).filter((x) => x && typeof x === 'object' && 'label' in x)
    : [];
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const focusIdxRef = useRef<number | null>(null);

  // 새 행 추가 후 자동 포커스
  useEffect(() => {
    if (focusIdxRef.current != null) {
      const idx = focusIdxRef.current;
      const el = inputsRef.current[idx];
      if (el) {
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {/* ignore */}
      }
      focusIdxRef.current = null;
    }
  }, [items.length]);

  const toggle = (idx: number) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, done: !it.done } : it)));
  };
  const updateLabel = (idx: number, label: string) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, label } : it)));
  };
  const insertAfter = (idx: number) => {
    const next = items.slice();
    next.splice(idx + 1, 0, { label: '', done: false });
    focusIdxRef.current = idx + 1;
    onChange(next);
  };
  const remove = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    if (idx > 0) focusIdxRef.current = idx - 1;
    onChange(next);
  };
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };
  const addAtEnd = () => {
    const next = [...items, { label: '', done: false }];
    focusIdxRef.current = next.length - 1;
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      insertAfter(idx);
    } else if (e.key === 'Backspace' && items[idx]?.label === '') {
      e.preventDefault();
      if (items.length === 1) return;
      remove(idx);
    } else if (e.key === 'ArrowUp' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      move(idx, -1);
    } else if (e.key === 'ArrowDown' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      move(idx, 1);
    }
  };

  const doneCount = items.filter((it) => it.done && it.label.trim()).length;
  const totalCount = items.filter((it) => it.label.trim()).length;

  return (
    <div className="space-y-1">
      {totalCount > 0 && (
        <div className="text-[11px] text-gray-500 px-1">
          {doneCount}/{totalCount} 완료
          {doneCount === totalCount && totalCount > 0 && (
            <span className="ml-1 text-emerald-500 font-semibold">✓ 모두 완료</span>
          )}
        </div>
      )}
      <ul className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 bg-white">
        {items.map((it, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 px-2 py-1 group ${
              it.done ? 'bg-gray-50' : ''
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(i)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                it.done
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'bg-white border-gray-300 hover:border-violet-400'
              }`}
              aria-label={it.done ? '완료 취소' : '완료'}
            >
              {it.done && <Check size={12} strokeWidth={3} />}
            </button>
            <input
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="text"
              value={it.label}
              onChange={(e) => updateLabel(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              placeholder="항목"
              className={`flex-1 bg-transparent text-sm focus:outline-none py-1 ${
                it.done ? 'line-through text-gray-400' : 'text-gray-800'
              }`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 text-gray-300 hover:text-rose-500 px-1 transition-opacity"
              aria-label="삭제"
            >
              <X size={14} />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={addAtEnd}
            className="w-full flex items-center gap-2 px-2 py-2 text-gray-400 hover:bg-gray-50 text-sm"
          >
            <Plus size={16} />
            <span>+ 항목 추가</span>
          </button>
        </li>
      </ul>
      <p className="text-[10px] text-gray-400 px-1">
        Enter: 다음 항목 · Backspace(빈 줄): 삭제 · Ctrl+↑↓: 순서 이동
      </p>
    </div>
  );
}

// ────────────────────────────────────────────
// Relation 입력 — 다른 컬렉션의 항목 다중 선택
// ────────────────────────────────────────────
type RelEntry = { id: string; data: Record<string, unknown> };

function RelationInput({
  prop,
  value,
  onChange,
}: {
  prop: ArchiveProperty;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const targetId = prop.target_collection_id;
  const allowMultiple = prop.allow_multiple !== false;
  const [entries, setEntries] = useState<RelEntry[] | null>(null);
  const [titleKey, setTitleKey] = useState<string>('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const ids: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((x): x is string => typeof x === 'string')
    : typeof value === 'string'
      ? [value]
      : [];

  // 대상 컬렉션 + entries 조회
  useEffect(() => {
    if (!targetId) return;
    let cancel = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/archive/collections/${targetId}`).then((r) => r.json()),
      fetch(`/api/archive/collections/${targetId}/entries`).then((r) => r.json()),
    ])
      .then(([c, e]) => {
        if (cancel) return;
        const schema = (c.collection?.schema ?? []) as ArchiveProperty[];
        setTitleKey(schema[0]?.key ?? '');
        setEntries((e.entries ?? []) as RelEntry[]);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [targetId]);

  if (!targetId) {
    return (
      <div className="text-xs text-rose-500 italic">
        대상 컬렉션이 설정되지 않았어요.
      </div>
    );
  }

  const titleOf = (e: RelEntry) =>
    titleKey ? String(e.data?.[titleKey] ?? '(제목 없음)') : '(제목 없음)';

  const selected = (entries ?? []).filter((e) => ids.includes(e.id));
  const filtered = (entries ?? []).filter((e) => {
    if (ids.includes(e.id)) return false;
    if (!search.trim()) return true;
    return titleOf(e).toLowerCase().includes(search.toLowerCase());
  });

  const addOne = (id: string) => {
    if (allowMultiple) {
      onChange([...ids, id]);
    } else {
      onChange([id]);
      setOpen(false);
    }
    setSearch('');
  };
  const removeOne = (id: string) => {
    onChange(ids.filter((x) => x !== id));
  };

  return (
    <div className="space-y-1">
      {/* 선택된 항목 칩 */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-xs px-2 py-1 rounded-full"
            >
              <span className="truncate max-w-[160px]">{titleOf(e)}</span>
              <button
                type="button"
                onClick={() => removeOne(e.id)}
                className="text-violet-400 hover:text-violet-700"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* 추가 버튼 / 검색 박스 */}
      {!open ? (
        (allowMultiple || selected.length === 0) && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs text-violet-600 inline-flex items-center gap-1 px-2 py-1 border border-dashed border-violet-200 rounded-lg hover:bg-violet-50"
          >
            <Plus size={11} /> {allowMultiple ? '연결 추가' : '연결 선택'}
          </button>
        )
      ) : (
        <div className="border border-violet-200 rounded-lg bg-white">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="검색..."
            className="w-full px-2 py-1.5 text-xs focus:outline-none"
          />
          <div className="max-h-48 overflow-y-auto border-t border-gray-100">
            {loading ? (
              <div className="text-xs text-gray-400 px-2 py-2">불러오는 중…</div>
            ) : filtered.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-2">
                {search ? '결과 없음' : '항목 없음'}
              </div>
            ) : (
              filtered.slice(0, 30).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => addOne(e.id)}
                  className="w-full text-left text-xs px-2 py-1.5 hover:bg-violet-50 truncate"
                >
                  {titleOf(e)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
    case 'checklist':
      return <ChecklistInput value={v} onChange={onChange} />;
    case 'relation':
      return <RelationInput prop={prop} value={v} onChange={onChange} />;
    case 'rollup':
    case 'formula':
      return (
        <div className="text-xs text-gray-400 italic">
          {prop.type === 'rollup' ? '집계 (자동 계산)' : '수식 (자동 계산)'}
        </div>
      );
    case 'activity_stat': {
      const display = formatPropertyDisplay(prop, v);
      return (
        <div className="text-xs text-gray-700 bg-amber-50 px-2 py-1.5 rounded-lg border border-amber-100">
          {display || <span className="text-gray-400">—</span>}
        </div>
      );
    }
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
    case 'checklist': {
      const arr = Array.isArray(value) ? (value as Array<{ done?: boolean }>) : [];
      if (arr.length === 0) return '';
      const done = arr.filter((x) => x.done).length;
      return `☑ ${done}/${arr.length}`;
    }
    case 'relation': {
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      if (arr.length === 0) return '';
      return `🔗 ${arr.length}건 연결`;
    }
    case 'rollup':
    case 'formula':
      return value == null ? '' : String(value);
    case 'activity_stat': {
      if (value == null || value === '') return '';
      switch (prop.stat_kind) {
        case 'count':
          return `${value as number}회`;
        case 'total_min':
        case 'avg_min': {
          const m = value as number;
          if (m <= 0) return '0분';
          const h = Math.floor(m / 60);
          const mm = m % 60;
          if (h === 0) return `${mm}분`;
          if (mm === 0) return `${h}시간`;
          return `${h}시간 ${mm}분`;
        }
        case 'last_date':
        case 'first_date': {
          const d = String(value);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
          return d.slice(5).replace('-', '/'); // M/D
        }
        default:
          return String(value);
      }
    }
    default:
      return String(value);
  }
}
