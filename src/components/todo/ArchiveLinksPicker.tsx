'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Search, Library } from 'lucide-react';
import type { ArchiveCollection, ArchiveProperty } from '@/types';

export type ArchiveLink = { collection_id: string; entry_id: string };

interface Props {
  value: ArchiveLink[];
  onChange: (links: ArchiveLink[]) => void;
  /** 지정 시: 컬렉션 선택 단계 건너뛰고 이 컬렉션의 항목만 보여줌 */
  fixedCollectionId?: string;
}

type CollectionLite = {
  id: string;
  name: string;
  emoji: string;
  schema: ArchiveProperty[];
};
type EntryLite = { id: string; data: Record<string, unknown> };

/**
 * 할일/일정에 아카이브 컬렉션 항목들을 연결.
 * 단계: 컬렉션 선택 → 그 안의 항목 다중 선택 → 칩으로 누적.
 */
export default function ArchiveLinksPicker({ value, onChange, fixedCollectionId }: Props) {
  const [collections, setCollections] = useState<CollectionLite[]>([]);
  const [entriesByCollection, setEntriesByCollection] = useState<
    Record<string, EntryLite[]>
  >({});
  const [open, setOpen] = useState<null | { collectionId: string }>(null);
  const [picking, setPicking] = useState(false); // 컬렉션 선택 단계
  const [search, setSearch] = useState('');

  // 컬렉션 목록
  useEffect(() => {
    fetch('/api/archive/collections')
      .then((r) => r.json())
      .then((j) => {
        const list = (j.collections ?? []).map((c: ArchiveCollection) => ({
          id: c.id,
          name: c.name,
          emoji: c.emoji,
          schema: (c.schema ?? []) as ArchiveProperty[],
        }));
        setCollections(list);
      })
      .catch(() => {});
  }, []);

  // fixedCollectionId 가 있으면 자동으로 그 컬렉션 진입 + entries 로드
  useEffect(() => {
    if (fixedCollectionId) {
      setOpen({ collectionId: fixedCollectionId });
      setPicking(false);
      // entries 로드
      if (!entriesByCollection[fixedCollectionId]) {
        fetch(`/api/archive/collections/${fixedCollectionId}/entries`)
          .then((r) => r.json())
          .then((j) => {
            setEntriesByCollection((prev) => ({
              ...prev,
              [fixedCollectionId]: (j.entries ?? []) as EntryLite[],
            }));
          })
          .catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixedCollectionId]);

  // 선택된 link 들의 컬렉션 entries 캐시 (제목 표시용)
  useEffect(() => {
    const needed = Array.from(new Set(value.map((l) => l.collection_id)));
    needed.forEach((cid) => {
      if (entriesByCollection[cid]) return;
      fetch(`/api/archive/collections/${cid}/entries`)
        .then((r) => r.json())
        .then((j) => {
          setEntriesByCollection((prev) => ({
            ...prev,
            [cid]: (j.entries ?? []) as EntryLite[],
          }));
        })
        .catch(() => {});
    });
  }, [value, entriesByCollection]);

  const titleOf = (collectionId: string, entryId: string): string => {
    const list = entriesByCollection[collectionId] ?? [];
    const entry = list.find((e) => e.id === entryId);
    if (!entry) return '(불러오는 중)';
    const col = collections.find((c) => c.id === collectionId);
    const titleKey = col?.schema?.[0]?.key;
    if (!titleKey) return '(제목 없음)';
    return String(entry.data?.[titleKey] ?? '(제목 없음)');
  };

  const collectionInfo = (id: string) => collections.find((c) => c.id === id);

  const removeLink = (link: ArchiveLink) => {
    onChange(value.filter((l) => l.entry_id !== link.entry_id));
  };

  const addLink = (link: ArchiveLink) => {
    if (value.some((l) => l.entry_id === link.entry_id)) return;
    onChange([...value, link]);
  };

  const closeAll = () => {
    setSearch('');
    if (fixedCollectionId) {
      // 고정 컬렉션 모드에서는 닫지 않고 그대로 유지
      return;
    }
    setOpen(null);
    setPicking(false);
  };

  // 항목 검색 결과
  const searchResults = useMemo<EntryLite[]>(() => {
    if (!open) return [];
    const list = entriesByCollection[open.collectionId] ?? [];
    const col = collectionInfo(open.collectionId);
    const titleKey = col?.schema?.[0]?.key ?? '';
    if (!search.trim()) return list.slice(0, 30);
    const q = search.toLowerCase();
    return list
      .filter((e) =>
        titleKey
          ? String(e.data?.[titleKey] ?? '').toLowerCase().includes(q)
          : false,
      )
      .slice(0, 30);
  }, [open, entriesByCollection, search, collections]);

  return (
    <div className="space-y-1.5">
      {/* 선택된 칩들 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((link) => {
            const col = collectionInfo(link.collection_id);
            return (
              <span
                key={link.entry_id}
                className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-xs px-2 py-1 rounded-full"
              >
                <span>{col?.emoji ?? '📦'}</span>
                <span className="truncate max-w-[160px]">
                  {titleOf(link.collection_id, link.entry_id)}
                </span>
                <button
                  type="button"
                  onClick={() => removeLink(link)}
                  className="text-violet-400 hover:text-violet-700"
                >
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* + 추가 버튼 / 컬렉션 선택 / 항목 선택 */}
      {!picking && !open && !fixedCollectionId && (
        <button
          type="button"
          onClick={() => {
            if (collections.length === 0) return;
            if (collections.length === 1) {
              // 컬렉션 1개면 바로 항목 선택으로
              loadEntries(collections[0].id);
              setOpen({ collectionId: collections[0].id });
            } else {
              setPicking(true);
            }
          }}
          disabled={collections.length === 0}
          className="text-xs text-violet-600 inline-flex items-center gap-1 px-2 py-1 border border-dashed border-violet-200 rounded-lg hover:bg-violet-50 disabled:opacity-50"
        >
          <Plus size={11} /> 아카이브 항목 연결
        </button>
      )}

      {/* 컬렉션 선택 단계 */}
      {picking && (
        <div className="border border-violet-200 rounded-xl bg-white p-2 space-y-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-violet-700 inline-flex items-center gap-1">
              <Library size={12} /> 어떤 컬렉션과 연결?
            </p>
            <button
              type="button"
              onClick={closeAll}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {collections.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  loadEntries(c.id);
                  setPicking(false);
                  setOpen({ collectionId: c.id });
                }}
                className="text-left text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-violet-300"
              >
                <span className="mr-1">{c.emoji}</span>
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 항목 선택 단계 */}
      {open && (
        <div className="border border-violet-200 rounded-xl bg-white">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-100">
            <Search size={12} className="text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`${collectionInfo(open.collectionId)?.name ?? ''} 검색`}
              className="flex-1 text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={closeAll}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-2">
                {search ? '결과 없음' : '항목 없음'}
              </div>
            ) : (
              searchResults.map((e) => {
                const col = collectionInfo(open.collectionId);
                const titleKey = col?.schema?.[0]?.key ?? '';
                const title = titleKey
                  ? String(e.data?.[titleKey] ?? '(제목 없음)')
                  : '(제목 없음)';
                const already = value.some((l) => l.entry_id === e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                      addLink({ collection_id: open.collectionId, entry_id: e.id });
                      setSearch('');
                    }}
                    disabled={already}
                    className="w-full text-left text-xs px-2 py-1.5 hover:bg-violet-50 truncate disabled:opacity-30"
                  >
                    {already ? '✓ ' : ''}
                    {title}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );

  function loadEntries(cid: string) {
    if (entriesByCollection[cid]) return;
    fetch(`/api/archive/collections/${cid}/entries`)
      .then((r) => r.json())
      .then((j) => {
        setEntriesByCollection((prev) => ({
          ...prev,
          [cid]: (j.entries ?? []) as EntryLite[],
        }));
      })
      .catch(() => {});
  }
}
