'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Plus, Settings as SettingsIcon, Trash2, ExternalLink } from 'lucide-react';
import type { ArchiveCollection, ArchiveEntry, ArchiveProperty } from '@/types';
import PropertyInput, { formatPropertyDisplay } from '@/components/archive/PropertyInput';

type Params = { id: string };

export default function ArchiveCollectionPage({ params }: { params: Promise<Params> }) {
  const { id } = use(params);
  const router = useRouter();
  const [collection, setCollection] = useState<ArchiveCollection | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<ArchiveEntry | 'new' | null>(null);
  const [editingSchema, setEditingSchema] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/archive/collections/${id}`).then((r) => r.json()),
      fetch(`/api/archive/collections/${id}/entries`).then((r) => r.json()),
    ])
      .then(([c, e]) => {
        setCollection(c.collection ?? null);
        setEntries(e.entries ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const deleteCollection = async () => {
    if (!confirm('이 컬렉션을 삭제할까요?\n(항목들도 함께 사라집니다)')) return;
    await fetch(`/api/archive/collections/${id}`, { method: 'DELETE' });
    router.push('/archive');
  };

  if (loading || !collection) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-400">
        불러오는 중…
      </div>
    );
  }

  const schema = (collection.schema ?? []) as ArchiveProperty[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/archive" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-2xl shrink-0">{collection.emoji}</span>
            <h1 className="text-lg font-bold text-gray-900 truncate">{collection.name}</h1>
            <span className="text-[11px] text-gray-400 shrink-0">{entries.length}건</span>
          </div>
          <button
            onClick={() => setEditingSchema(true)}
            className="p-2 rounded-xl text-gray-500 active:bg-gray-100 mr-12"
            aria-label="설정"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-2">
        {/* 새 항목 추가 버튼 */}
        <button
          onClick={() => setEditingEntry('new')}
          className="w-full py-3 rounded-2xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1 active:bg-violet-700"
        >
          <Plus size={16} /> 새 항목
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 space-y-2 pt-3">
        {entries.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12">
            아직 항목이 없어요. 첫 항목을 추가해보세요.
          </div>
        ) : (
          entries.map((e) => {
            const data = (e.data ?? {}) as Record<string, unknown>;
            const titleProp = schema[0];
            const titleValue = titleProp ? data[titleProp.key] : null;
            return (
              <button
                key={e.id}
                onClick={() => setEditingEntry(e)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50"
              >
                <div className="text-sm font-bold text-gray-900 truncate">
                  {String(titleValue ?? '(제목 없음)')}
                </div>
                {/* 나머지 속성 미리보기 */}
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 mt-1">
                  {schema.slice(1).map((p) => {
                    const val = data[p.key];
                    if (val == null || val === '') return null;
                    const display = formatPropertyDisplay(p, val);
                    if (!display) return null;
                    if (p.type === 'url') {
                      return (
                        <a
                          key={p.key}
                          href={String(val)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(ev) => ev.stopPropagation()}
                          className="text-violet-600 inline-flex items-center gap-0.5 hover:underline"
                        >
                          🔗 링크 <ExternalLink size={10} />
                        </a>
                      );
                    }
                    return (
                      <span key={p.key}>
                        <span className="text-gray-400">{p.label}:</span> {display}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 항목 편집 시트 */}
      {editingEntry && (
        <EntryFormSheet
          collectionId={id}
          schema={schema}
          color={collection.color}
          entry={editingEntry === 'new' ? null : editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            load();
          }}
        />
      )}

      {/* 컬렉션 설정 시트 */}
      {editingSchema && (
        <CollectionSettingsSheet
          collection={collection}
          onClose={() => setEditingSchema(false)}
          onSaved={() => {
            setEditingSchema(false);
            load();
          }}
          onDelete={deleteCollection}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// 항목 편집 시트
// ─────────────────────────────────────────
function EntryFormSheet({
  collectionId,
  schema,
  color,
  entry,
  onClose,
  onSaved,
}: {
  collectionId: string;
  schema: ArchiveProperty[];
  color: string;
  entry: ArchiveEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(
    (entry?.data as Record<string, unknown>) ?? {},
  );
  const [busy, setBusy] = useState(false);
  void color;

  const submit = async () => {
    setBusy(true);
    try {
      if (entry) {
        await fetch(`/api/archive/entries/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
      } else {
        await fetch(`/api/archive/collections/${collectionId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!entry) return;
    if (!confirm('이 항목을 삭제할까요?')) return;
    await fetch(`/api/archive/entries/${entry.id}`, { method: 'DELETE' });
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-base font-bold text-gray-900">
            {entry ? '항목 수정' : '새 항목'}
          </h3>
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-4">
          {schema.map((p) => (
            <div key={p.key}>
              <label className="text-xs text-gray-500 mb-1 block">
                {p.label}
                {p.required && <span className="text-rose-500 ml-1">*</span>}
              </label>
              <PropertyInput
                prop={p}
                value={data[p.key]}
                onChange={(v) => setData({ ...data, [p.key]: v })}
              />
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            {entry && (
              <button
                onClick={remove}
                disabled={busy}
                className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-semibold disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// 컬렉션 설정 시트 (스키마 편집)
// ─────────────────────────────────────────
function CollectionSettingsSheet({
  collection,
  onClose,
  onSaved,
  onDelete,
}: {
  collection: ArchiveCollection;
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(collection.name);
  const [emoji, setEmoji] = useState(collection.emoji);
  const [description, setDescription] = useState(collection.description);
  const [schema, setSchema] = useState<ArchiveProperty[]>(
    (collection.schema ?? []) as ArchiveProperty[],
  );
  const [busy, setBusy] = useState(false);

  const updateProp = (i: number, patch: Partial<ArchiveProperty>) => {
    setSchema(schema.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removeProp = (i: number) => setSchema(schema.filter((_, idx) => idx !== i));
  const addProp = () => {
    setSchema([
      ...schema,
      { key: `field${schema.length + 1}`, label: '새 속성', type: 'text' },
    ]);
  };
  const moveProp = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= schema.length) return;
    const arr = [...schema];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setSchema(arr);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await fetch(`/api/archive/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, emoji, description, schema }),
      });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    text: '짧은 텍스트',
    longtext: '긴 텍스트',
    number: '숫자',
    currency: '금액',
    date: '날짜',
    url: 'URL',
    select: '단일 선택',
    multiselect: '복수 선택',
    rating: '별점',
    checkbox: '체크박스',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="text-base font-bold text-gray-900">컬렉션 설정</h3>
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">이름</label>
            <div className="flex gap-2">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value || '📦')}
                className="w-14 px-3 py-2 border border-gray-200 rounded-xl text-center text-xl"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">설명 (선택)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm"
            />
          </div>

          {/* 속성 편집 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-semibold">속성</label>
              <button
                onClick={addProp}
                className="text-xs text-violet-600 font-semibold inline-flex items-center gap-0.5"
              >
                <Plus size={12} /> 추가
              </button>
            </div>
            <div className="space-y-2">
              {schema.map((p, i) => (
                <div
                  key={i}
                  className="bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-100"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={p.label}
                      onChange={(e) => updateProp(i, { label: e.target.value })}
                      className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded bg-white"
                    />
                    <select
                      value={p.type}
                      onChange={(e) => updateProp(i, { type: e.target.value as ArchiveProperty['type'] })}
                      className="text-xs px-2 py-1 border border-gray-200 rounded bg-white"
                    >
                      {Object.entries(TYPE_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => moveProp(i, -1)}
                      disabled={i === 0}
                      className="text-xs px-1 text-gray-400 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveProp(i, 1)}
                      disabled={i === schema.length - 1}
                      className="text-xs px-1 text-gray-400 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => removeProp(i)}
                      className="text-xs text-rose-400 px-1"
                    >
                      ✕
                    </button>
                  </div>
                  {(p.type === 'select' || p.type === 'multiselect') && (
                    <input
                      value={(p.options ?? []).join(',')}
                      onChange={(e) =>
                        updateProp(i, {
                          options: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="옵션 (쉼표로 구분)"
                      className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onDelete}
              className="px-3 py-2.5 rounded-xl border border-rose-200 text-rose-500 text-sm font-semibold"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={busy || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
