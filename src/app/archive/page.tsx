'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, ChevronRight, Sparkles, Search, ArrowUpDown, ChevronUp, ChevronDown, FolderTree } from 'lucide-react';
import type { ArchiveCollection } from '@/types';
import { ARCHIVE_TEMPLATES, BLANK_SCHEMA } from '@/lib/archive-templates';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

type EntryResult = {
  id: string;
  collection_id: string;
  collection_name: string;
  collection_emoji: string;
  collection_color: string;
  title: string;
};

export default function ArchivePage() {
  const [collections, setCollections] = useState<ArchiveCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [reorderMode, setReorderMode] = useState(false);
  const [organizeMode, setOrganizeMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [autoBusy, setAutoBusy] = useState(false);
  // 항목(엔트리) 검색 결과
  const [entryResults, setEntryResults] = useState<EntryResult[]>([]);
  const [searching, setSearching] = useState(false);

  const moveCollection = async (idx: number, dir: -1 | 1) => {
    if (busy) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= collections.length) return;
    const next = collections.slice();
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setCollections(next);
    setBusy(true);
    try {
      await fetch('/api/archive/collections/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          ids: next.map((c) => c.id),
        }),
      });
    } finally {
      setBusy(false);
    }
  };

  // AI 자동 분류 — 성격별 카테고리를 만들고 컬렉션을 하위로 정리
  const autoCategorize = async () => {
    if (autoBusy) return;
    if (
      !confirm(
        'AI가 컬렉션들을 성격별 카테고리로 자동 분류할까요?\n(이미 분류된 항목은 그대로 둡니다)',
      )
    )
      return;
    setAutoBusy(true);
    try {
      const res = await fetch('/api/archive/auto-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: HOUSEHOLD_ID }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(j.error ?? 'AI 분류 실패');
        return;
      }
      alert(j.message ?? '완료');
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : '실패');
    } finally {
      setAutoBusy(false);
    }
  };

  // 상위 컬렉션 지정/해제
  const setParent = async (id: string, parentId: string | null) => {
    if (busy) return;
    setBusy(true);
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, parent_id: parentId } : c)),
    );
    try {
      await fetch(`/api/archive/collections/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parentId }),
      });
    } finally {
      setBusy(false);
    }
  };

  // 컬렉션 이름/설명 매칭 (클라이언트)
  const filteredCollections = useMemo(() => {
    if (!search.trim()) return collections;
    const q = search.toLowerCase();
    return collections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [collections, search]);

  // 상/하위 그룹 구성 (2단계)
  const { tops, childrenOf, childCountMap } = useMemo(() => {
    const byId = new Map(collections.map((c) => [c.id, c]));
    const childrenOf = new Map<string, ArchiveCollection[]>();
    const tops: ArchiveCollection[] = [];
    for (const c of collections) {
      if (c.parent_id && byId.has(c.parent_id)) {
        const arr = childrenOf.get(c.parent_id) ?? [];
        arr.push(c);
        childrenOf.set(c.parent_id, arr);
      } else {
        tops.push(c);
      }
    }
    const childCountMap = new Map<string, number>();
    for (const [pid, arr] of childrenOf) childCountMap.set(pid, arr.length);
    return { tops, childrenOf, childCountMap };
  }, [collections]);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/archive/collections?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((j) => setCollections(j.collections ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 항목 검색 (디바운스)
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setEntryResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const h = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/archive/search?household_id=${HOUSEHOLD_ID}&q=${encodeURIComponent(q)}`,
        );
        const j = await res.json();
        setEntryResults(Array.isArray(j.entries) ? j.entries : []);
      } catch {
        setEntryResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [search]);

  const collectionCard = (c: ArchiveCollection, small = false) => (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div
        className={`${small ? 'w-9 h-9 text-lg rounded-xl' : 'w-12 h-12 text-2xl rounded-2xl'} flex items-center justify-center shrink-0`}
        style={{ backgroundColor: `${c.color}22` }}
      >
        {c.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`${small ? 'text-[13px]' : 'text-sm'} font-bold text-gray-900 truncate`}>
          {c.name}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          {(c.entry_count ?? 0).toLocaleString('ko-KR')}건
          {c.description && ` · ${c.description}`}
        </div>
      </div>
    </div>
  );

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isSearching = !!search.trim();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">📦 아카이브</h1>
          <div className="flex items-center gap-1 mr-12">
            {collections.length > 1 && !reorderMode && (
              <button
                onClick={() => setOrganizeMode((v) => !v)}
                className={`text-sm font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-lg ${
                  organizeMode ? 'bg-violet-600 text-white' : 'text-violet-600'
                }`}
                title="상/하위 분류"
              >
                <FolderTree size={14} /> {organizeMode ? '완료' : '분류'}
              </button>
            )}
            {collections.length > 1 && !organizeMode && (
              <button
                onClick={() => setReorderMode((v) => !v)}
                className={`text-sm font-semibold inline-flex items-center gap-0.5 px-2 py-1 rounded-lg ${
                  reorderMode ? 'bg-amber-500 text-white' : 'text-amber-600'
                }`}
                title="컬렉션 순서"
              >
                <ArrowUpDown size={14} /> {reorderMode ? '완료' : '순서'}
              </button>
            )}
            {!reorderMode && !organizeMode && (
              <button
                onClick={() => setCreating(true)}
                className="text-sm text-violet-600 font-semibold inline-flex items-center gap-1"
              >
                <Plus size={16} /> 새 컬렉션
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
        {/* 검색 */}
        {!loading && collections.length > 0 && !reorderMode && !organizeMode && (
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="컬렉션·항목 내용 검색"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-100 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-200"
            />
          </div>
        )}

        {loading ? (
          <div className="text-center text-sm text-gray-400 py-12">불러오는 중…</div>
        ) : collections.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-sm text-gray-500 mb-4">
              아직 컬렉션이 없어요.
              <br />
              일기 / 레시피 / 독서 / 드라마 등 자유롭게 만들어 보세요.
            </p>
            <button
              onClick={() => setCreating(true)}
              className="px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center gap-1"
            >
              <Plus size={14} /> 첫 컬렉션 만들기
            </button>
          </div>
        ) : isSearching ? (
          /* ── 검색 결과: 컬렉션 + 항목 ── */
          <div className="space-y-4">
            {/* 컬렉션 매칭 */}
            {filteredCollections.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-gray-400 px-1">컬렉션</div>
                {filteredCollections.map((c) => (
                  <Link
                    key={c.id}
                    href={`/archive/${c.id}`}
                    className="flex items-center bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50 gap-2"
                  >
                    {collectionCard(c)}
                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                  </Link>
                ))}
              </div>
            )}

            {/* 항목 매칭 */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-gray-400 px-1">
                항목 {searching ? '검색 중…' : `(${entryResults.length})`}
              </div>
              {entryResults.map((e) => (
                <Link
                  key={e.id}
                  href={`/archive/${e.collection_id}?q=${encodeURIComponent(search.trim())}`}
                  className="flex items-center bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50 gap-3"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                    style={{ backgroundColor: `${e.collection_color}22` }}
                  >
                    {e.collection_emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">
                      {e.title}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {e.collection_name}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 shrink-0" />
                </Link>
              ))}
              {!searching &&
                entryResults.length === 0 &&
                filteredCollections.length === 0 && (
                  <div className="text-center text-sm text-gray-400 py-8">
                    "{search}" 검색 결과가 없어요.
                  </div>
                )}
            </div>
          </div>
        ) : reorderMode ? (
          /* ── 순서 변경: 평면 리스트 ── */
          collections.map((c, realIdx) => (
            <div
              key={c.id}
              className="flex items-center bg-white rounded-2xl border border-amber-200 px-3 py-2.5 gap-2"
            >
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => moveCollection(realIdx, -1)}
                  disabled={realIdx === 0 || busy}
                  className="p-1 rounded text-amber-600 disabled:opacity-30 active:bg-amber-50"
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  onClick={() => moveCollection(realIdx, 1)}
                  disabled={realIdx === collections.length - 1 || busy}
                  className="p-1 rounded text-amber-600 disabled:opacity-30 active:bg-amber-50"
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              {collectionCard(c)}
            </div>
          ))
        ) : organizeMode ? (
          /* ── 분류: 각 컬렉션에 상위 지정 ── */
          <div className="space-y-2">
            <button
              onClick={autoCategorize}
              disabled={autoBusy}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              <Sparkles size={16} />
              {autoBusy ? 'AI가 분류 중…' : 'AI로 성격별 자동 분류'}
            </button>
            <p className="text-[11px] text-violet-700 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
              AI가 알아서 카테고리를 만들어 묶어줘요. 아래에서 직접 상위 컬렉션을 골라 조정할 수도 있어요 (2단계).
            </p>
            {collections.map((c) => {
              const hasChildren = (childCountMap.get(c.id) ?? 0) > 0;
              // 상위가 될 수 있는 후보: 최상위(자식 가능)이면서 자기 자신 아님
              const parentOptions = collections.filter(
                (p) => p.id !== c.id && !p.parent_id,
              );
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl border border-violet-100 px-3 py-2.5 space-y-2"
                >
                  {collectionCard(c, true)}
                  {hasChildren ? (
                    <div className="text-[11px] text-gray-400 pl-1">
                      하위 컬렉션 {childCountMap.get(c.id)}개 보유 — 최상위로 유지됩니다.
                    </div>
                  ) : (
                    <select
                      value={c.parent_id ?? ''}
                      onChange={(e) => setParent(c.id, e.target.value || null)}
                      disabled={busy}
                      className="w-full text-[13px] px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">📂 최상위 (분류 없음)</option>
                      {parentOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.emoji} {p.name} 의 하위로
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── 기본: 상/하위 그룹 렌더링 ── */
          tops.map((c) => {
            const children = childrenOf.get(c.id) ?? [];
            const hasChildren = children.length > 0;
            const isCollapsed = collapsed.has(c.id);
            return (
              <div key={c.id} className="space-y-1.5">
                <div className="flex items-center gap-1">
                  <Link
                    href={`/archive/${c.id}`}
                    className="flex items-center bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50 gap-2 flex-1 min-w-0"
                  >
                    {collectionCard(c)}
                    <ChevronRight size={18} className="text-gray-300 shrink-0" />
                  </Link>
                  {hasChildren && (
                    <button
                      onClick={() => toggleCollapse(c.id)}
                      className="p-2 rounded-xl text-gray-400 active:bg-gray-100 shrink-0"
                      title={isCollapsed ? '펼치기' : '접기'}
                    >
                      {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                    </button>
                  )}
                </div>
                {hasChildren && !isCollapsed && (
                  <div className="ml-5 pl-3 border-l-2 border-gray-100 space-y-1.5">
                    {children.map((ch) => (
                      <Link
                        key={ch.id}
                        href={`/archive/${ch.id}`}
                        className="flex items-center bg-white rounded-xl border border-gray-100 px-3 py-2 active:bg-gray-50 gap-2"
                      >
                        {collectionCard(ch, true)}
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* AI 생성 안내 */}
        <div className="mt-4 bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="text-violet-600 shrink-0 mt-0.5" />
            <div className="text-xs text-violet-900 leading-relaxed">
              <span className="font-semibold">AI 어시스턴트</span> 에서 이렇게 말해보세요:
              <br />
              <span className="text-violet-700">"여행 기록 컬렉션 만들어줘"</span> · <span className="text-violet-700">"운동 일지 만들어줘"</span>
              <br />
              → 적절한 속성을 자동으로 추천해서 만들어줍니다.
            </div>
          </div>
        </div>
      </div>

      {creating && (
        <CreateCollectionSheet
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// 새 컬렉션 시트 — 템플릿 선택 또는 빈 컬렉션
// ─────────────────────────────────────────
function CreateCollectionSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [aiIntent, setAiIntent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  const aiCreate = async () => {
    if (!aiIntent.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError('');
    try {
      const res = await fetch('/api/archive/ai-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          intent: aiIntent.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error ?? 'AI 생성 실패');
        return;
      }
      onCreated();
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '실패');
    } finally {
      setAiBusy(false);
    }
  };

  const create = async (
    overrides: Partial<{
      name: string;
      emoji: string;
      color: string;
      description: string;
      schema: unknown[];
    }>,
  ) => {
    setBusy(true);
    try {
      const res = await fetch('/api/archive/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          name: overrides.name ?? '새 컬렉션',
          emoji: overrides.emoji ?? '📦',
          color: overrides.color ?? '#6366f1',
          description: overrides.description ?? '',
          schema: overrides.schema ?? BLANK_SCHEMA,
        }),
      });
      if (res.ok) onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">새 컬렉션</h3>
        </div>

        <div className="overflow-y-auto px-4 pb-6 space-y-2">
          <p className="text-xs text-gray-500 px-1 mb-2">
            AI 로 만들거나, 템플릿 / 빈 컬렉션부터 시작하세요.
          </p>

          {/* AI 로 만들기 */}
          <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-100 p-3 space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Sparkles size={15} className="text-violet-600" />
              <span className="text-sm font-bold text-violet-900">AI 로 만들기</span>
            </div>
            <textarea
              value={aiIntent}
              onChange={(e) => setAiIntent(e.target.value)}
              placeholder='예) "여행 기록 컬렉션 만들어줘", "와인 노트 만들어줘"'
              rows={2}
              className="w-full text-sm px-3 py-2 rounded-xl bg-white border border-violet-100 focus:outline-none focus:border-violet-300 resize-none placeholder-gray-400"
              disabled={aiBusy || busy}
            />
            {aiError && (
              <p className="text-[11px] text-red-500 px-1">{aiError}</p>
            )}
            <button
              onClick={aiCreate}
              disabled={!aiIntent.trim() || aiBusy || busy}
              className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            >
              <Sparkles size={14} />
              {aiBusy ? 'AI 가 생성 중…' : 'AI 추천 받기'}
            </button>
          </div>

          {/* 빈 컬렉션 */}
          <div className="text-xs text-gray-400 font-semibold px-1 pt-3">직접 만들기</div>
          <button
            onClick={() =>
              create({ name: '새 컬렉션', emoji: '📦', schema: BLANK_SCHEMA })
            }
            disabled={busy}
            className="w-full text-left px-4 py-3 rounded-2xl border-2 border-dashed border-gray-200 active:bg-gray-50 disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-2xl">
                ➕
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">빈 컬렉션</div>
                <div className="text-[11px] text-gray-500">
                  속성을 직접 정의해서 시작
                </div>
              </div>
            </div>
          </button>

          {/* 템플릿 */}
          <div className="text-xs text-gray-400 font-semibold px-1 pt-3">템플릿</div>
          {ARCHIVE_TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => create({ ...t })}
              disabled={busy}
              className="w-full text-left px-4 py-3 rounded-2xl bg-white border border-gray-100 active:bg-gray-50 disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `${t.color}22` }}
                >
                  {t.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900">{t.name}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {t.description} · 속성 {t.schema.length}개
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
