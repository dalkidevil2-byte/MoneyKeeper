'use client';

import { use, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  ExternalLink,
  Sparkles,
  Loader2,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  X as XIcon,
  Check,
} from 'lucide-react';
import type { ArchiveCollection, ArchiveEntry, ArchiveProperty } from '@/types';
import PropertyInput, { formatPropertyDisplay } from '@/components/archive/PropertyInput';
import ArchiveCalendarView from '@/components/archive/ArchiveCalendarView';
import ArchiveTableView from '@/components/archive/ArchiveTableView';
import ArchiveBoardView from '@/components/archive/ArchiveBoardView';
import LinkedTasksList from '@/components/archive/LinkedTasksList';
import FilterPanel from '@/components/archive/FilterPanel';
import AnalyzeModal from '@/components/archive/AnalyzeModal';
import { List, LayoutGrid, Calendar as CalendarIcon, Table as TableIcon, Columns3, Filter } from 'lucide-react';

type Params = { id: string };

export default function ArchiveCollectionPage({ params }: { params: Promise<Params> }) {
  const { id } = use(params);
  const router = useRouter();
  const [collection, setCollection] = useState<ArchiveCollection | null>(null);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEntry, setEditingEntry] = useState<ArchiveEntry | 'new' | null>(null);
  const [duplicateData, setDuplicateData] = useState<{
    data: Record<string, unknown>;
    sourceTitle: string;
  } | null>(null);
  const [editingSchema, setEditingSchema] = useState(false);
  const [search, setSearch] = useState('');
  // 컬럼별 필터 — { schemaKey: value }
  // select: string | undefined
  // multiselect: string[] (none = 전체)
  // rating: number (최소 평점, 0=전체)
  // checkbox: 'on' | 'off' | undefined
  // date: { from?: string; to?: string }
  // number/currency: { min?: number; max?: number }
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortBy, setSortBy] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiFillBusy, setAiFillBusy] = useState(false);
  const [aiFillError, setAiFillError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'gallery' | 'calendar' | 'table' | 'board'>('list');
  const [calendarDateKey, setCalendarDateKey] = useState<string>('');
  const [calendarEndDateKey, setCalendarEndDateKey] = useState<string>('');
  const [calendarShowSessions, setCalendarShowSessions] = useState<boolean>(true);
  const [boardGroupKey, setBoardGroupKey] = useState<string>('');
  const [aiFillResult, setAiFillResult] = useState<{
    data: Record<string, unknown>;
    filled: string[];
    missing: string[];
    sourceText: string;
  } | null>(null);
  const [aiTextModalOpen, setAiTextModalOpen] = useState(false);
  const [aiText, setAiText] = useState('');

  // 노션 임포트
  const [notionModalOpen, setNotionModalOpen] = useState(false);
  const [notionDbId, setNotionDbId] = useState('');
  const [notionBusy, setNotionBusy] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  // 노션 토큰 상태
  const [tokenStatus, setTokenStatus] = useState<{
    set: boolean;
    masked?: string;
    encryption_available: boolean;
  } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [tokenSaving, setTokenSaving] = useState(false);

  const loadTokenStatus = async () => {
    try {
      const r = await fetch('/api/settings/secrets/notion_token');
      const j = await r.json();
      setTokenStatus({
        set: !!j.set,
        masked: j.masked,
        encryption_available: !!j.encryption_available,
      });
    } catch {
      setTokenStatus({ set: false, encryption_available: false });
    }
  };

  const saveToken = async () => {
    if (!tokenInput.trim() || tokenSaving) return;
    setTokenSaving(true);
    setNotionError(null);
    try {
      const r = await fetch('/api/settings/secrets/notion_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: tokenInput.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '저장 실패');
      setTokenInput('');
      await loadTokenStatus();
    } catch (e) {
      setNotionError(e instanceof Error ? e.message : '실패');
    } finally {
      setTokenSaving(false);
    }
  };

  const deleteToken = async () => {
    if (!confirm('저장된 노션 토큰을 삭제할까요?')) return;
    await fetch('/api/settings/secrets/notion_token', { method: 'DELETE' });
    await loadTokenStatus();
  };
  const [notionPreview, setNotionPreview] = useState<{
    suggestions: Array<{
      notion: string;
      notion_type: string;
      archive_key: string | null;
      archive_label: string | null;
    }>;
    preview: Array<Record<string, unknown>>;
    total_fetched: number;
  } | null>(null);
  const [notionResult, setNotionResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);

  const notionPreviewFetch = async (useAi = false) => {
    if (!notionDbId.trim() || notionBusy) return;
    setNotionBusy(true);
    setNotionError(null);
    setNotionPreview(null);
    try {
      const res = await fetch(`/api/archive/collections/${id}/import-notion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notion_database_id: notionDbId.trim(),
          dry_run: true,
          use_ai: useAi,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '노션 미리보기 실패');
      setNotionPreview(j);
    } catch (e) {
      setNotionError(e instanceof Error ? e.message : '실패');
    } finally {
      setNotionBusy(false);
    }
  };

  const notionImportRun = async () => {
    if (!notionDbId.trim() || notionBusy) return;
    if (!confirm('이 컬렉션으로 가져올까요? 기존 항목은 그대로 두고 추가됩니다.')) return;
    setNotionBusy(true);
    setNotionError(null);
    try {
      // 미리보기에서 확인된 매핑 그대로 전달 (AI 매핑이든 자동매핑이든)
      const propertyMap: Record<string, string> = {};
      for (const s of notionPreview?.suggestions ?? []) {
        if (s.archive_key) propertyMap[s.notion] = s.archive_key;
      }
      const res = await fetch(`/api/archive/collections/${id}/import-notion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notion_database_id: notionDbId.trim(),
          property_map: propertyMap,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '가져오기 실패');
      setNotionResult({ imported: j.imported ?? 0, skipped: j.skipped ?? 0 });
      load();
    } catch (e) {
      setNotionError(e instanceof Error ? e.message : '실패');
    } finally {
      setNotionBusy(false);
    }
  };

  const closeNotion = () => {
    setNotionModalOpen(false);
    setNotionDbId('');
    setNotionPreview(null);
    setNotionResult(null);
    setNotionError(null);
  };

  // 노션 export 상태
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportTarget, setExportTarget] = useState<'existing' | 'new'>('new');
  const [exportDbId, setExportDbId] = useState('');
  const [exportPageId, setExportPageId] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<{
    exported: number;
    total: number;
    errors: string[];
    database_url?: string;
  } | null>(null);

  const runExport = async () => {
    if (exportBusy) return;
    if (exportTarget === 'existing' && !exportDbId.trim()) {
      setExportError('노션 DB ID 를 입력해주세요.');
      return;
    }
    if (exportTarget === 'new' && !exportPageId.trim()) {
      setExportError('새 DB 를 만들 부모 페이지 ID 를 입력해주세요.');
      return;
    }
    if (
      !confirm(
        `${entries.length}개 항목을 노션으로 내보낼까요? 노션에 새 페이지가 생성됩니다.`,
      )
    )
      return;
    setExportBusy(true);
    setExportError(null);
    try {
      const body: Record<string, string> = {};
      if (exportTarget === 'existing') body.notion_database_id = exportDbId.trim();
      else body.parent_page_id = exportPageId.trim();
      const r = await fetch(`/api/archive/collections/${id}/export-notion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? '내보내기 실패');
      setExportResult({
        exported: j.exported ?? 0,
        total: j.total ?? 0,
        errors: j.errors ?? [],
        database_url: j.database_url,
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '실패');
    } finally {
      setExportBusy(false);
    }
  };

  const closeExport = () => {
    setExportModalOpen(false);
    setExportDbId('');
    setExportPageId('');
    setExportResult(null);
    setExportError(null);
  };

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

  // 컬렉션이 로드되면 viewMode 초기화 (localStorage 우선, 없으면 card_layout)
  useEffect(() => {
    if (!collection) return;
    try {
      const saved = localStorage.getItem(`archive:view:${collection.id}`);
      if (
        saved === 'list' ||
        saved === 'gallery' ||
        saved === 'calendar' ||
        saved === 'table' ||
        saved === 'board'
      ) {
        setViewMode(saved);
      } else {
        setViewMode(collection.card_layout === 'gallery' ? 'gallery' : 'list');
      }
    } catch {
      setViewMode(collection.card_layout === 'gallery' ? 'gallery' : 'list');
    }
    // 첫 date 속성을 캘린더 기준으로 자동 선택
    const firstDate = (collection.schema ?? []).find(
      (p: ArchiveProperty) => p.type === 'date',
    );
    if (firstDate) setCalendarDateKey(firstDate.key);
    // date 속성이 2개 이상이면 두 번째를 자동으로 종료일로
    const dates = (collection.schema ?? []).filter(
      (p: ArchiveProperty) => p.type === 'date',
    );
    // 흔한 패턴 매칭: 'end_date', 'end', '종료', '마감' 같은 이름이 있으면 우선
    const endHints = ['end', '종료', '마감', '~', 'until', 'finish'];
    const guessEnd = dates.find((p, i) =>
      i > 0 && endHints.some((h) => (p.key.toLowerCase().includes(h)) || (p.label ?? '').toLowerCase().includes(h)),
    );
    setCalendarEndDateKey(guessEnd?.key ?? '');
    // 첫 select 속성을 보드 기준으로 자동 선택
    const firstSelect = (collection.schema ?? []).find(
      (p: ArchiveProperty) => p.type === 'select',
    );
    if (firstSelect) setBoardGroupKey(firstSelect.key);
  }, [collection]);

  // viewMode 변경 시 localStorage 저장
  const changeViewMode = (mode: 'list' | 'gallery' | 'calendar' | 'table' | 'board') => {
    setViewMode(mode);
    if (collection) {
      try {
        localStorage.setItem(`archive:view:${collection.id}`, mode);
      } catch {
        /* ignore */
      }
    }
  };

  // schema 의 date 속성 목록
  const dateProps = useMemo(
    () =>
      ((collection?.schema ?? []) as ArchiveProperty[]).filter(
        (p) => p.type === 'date',
      ),
    [collection],
  );

  // schema 의 select 속성 목록 (보드 뷰용)
  const selectProps = useMemo(
    () =>
      ((collection?.schema ?? []) as ArchiveProperty[]).filter(
        (p) => p.type === 'select',
      ),
    [collection],
  );

  const deleteCollection = async () => {
    if (!confirm('이 컬렉션을 삭제할까요?\n(항목들도 함께 사라집니다)')) return;
    await fetch(`/api/archive/collections/${id}`, { method: 'DELETE' });
    router.push('/archive');
  };

  // 검색 + 컬럼 필터링 + 정렬
  const filteredEntries = useMemo(() => {
    const cSchema = (collection?.schema ?? []) as ArchiveProperty[];

    let result = entries;

    // 1) 검색 — 모든 data 값 부분 일치
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((e) => {
        const data = (e.data ?? {}) as Record<string, unknown>;
        for (const v of Object.values(data)) {
          if (v == null) continue;
          if (Array.isArray(v)) {
            if (v.some((x) => String(x).toLowerCase().includes(q))) return true;
          } else if (String(v).toLowerCase().includes(q)) {
            return true;
          }
        }
        return false;
      });
    }

    // 2) 컬럼별 필터
    const activeFilters = Object.entries(filters).filter(([, v]) => {
      if (v == null) return false;
      if (typeof v === 'string') return v.length > 0;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'number') return v > 0;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return Object.values(o).some((x) => x != null && x !== '');
      }
      return false;
    });

    if (activeFilters.length > 0) {
      result = result.filter((e) => {
        const data = (e.data ?? {}) as Record<string, unknown>;
        for (const [key, fv] of activeFilters) {
          const prop = cSchema.find((p) => p.key === key);
          const val = data[key];
          if (!prop) continue;

          switch (prop.type) {
            case 'select': {
              if (val !== fv) return false;
              break;
            }
            case 'multiselect': {
              const arr = (Array.isArray(val) ? val : []) as string[];
              const wanted = fv as string[];
              // OR 매칭 — 선택된 옵션 중 하나라도 항목에 있으면 통과
              if (!wanted.some((w) => arr.includes(w))) return false;
              break;
            }
            case 'rating': {
              const n = Number(val) || 0;
              const min = Number(fv) || 0;
              if (n < min) return false;
              break;
            }
            case 'checkbox': {
              const checked = !!val;
              if (fv === 'on' && !checked) return false;
              if (fv === 'off' && checked) return false;
              break;
            }
            case 'date': {
              const d = String(val ?? '');
              const range = fv as { from?: string; to?: string };
              if (range.from && (!d || d < range.from)) return false;
              if (range.to && (!d || d > range.to)) return false;
              break;
            }
            case 'number':
            case 'currency': {
              const n = Number(val);
              const range = fv as { min?: number; max?: number };
              if (range.min != null && (isNaN(n) || n < range.min)) return false;
              if (range.max != null && (isNaN(n) || n > range.max)) return false;
              break;
            }
          }
        }
        return true;
      });
    }

    // 3) 정렬
    if (sortBy) {
      const prop = cSchema.find((p) => p.key === sortBy.key);
      const dir = sortBy.dir === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => {
        const av = (a.data as Record<string, unknown>)?.[sortBy.key];
        const bv = (b.data as Record<string, unknown>)?.[sortBy.key];
        // null/undefined 는 항상 뒤로
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (
          prop?.type === 'number' ||
          prop?.type === 'currency' ||
          prop?.type === 'rating'
        ) {
          return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
        }
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    return result;
  }, [entries, search, filters, sortBy, collection?.schema]);

  // 기존 항목 복제 — 같은 데이터로 새 entry 만들 준비.
  // 체크리스트는 모두 미체크로 리셋, date 는 비움 (새 일정에 맞게)
  const duplicateEntry = (e: ArchiveEntry) => {
    const src = (e.data ?? {}) as Record<string, unknown>;
    const titleProp = (collection?.schema ?? [])[0] as ArchiveProperty | undefined;
    const sourceTitle = titleProp ? String(src[titleProp.key] ?? '항목') : '항목';

    const cloned: Record<string, unknown> = {};
    for (const p of (collection?.schema ?? []) as ArchiveProperty[]) {
      const v = src[p.key];
      if (v == null) continue;
      if (p.type === 'checklist' && Array.isArray(v)) {
        // 라벨만 유지, done 모두 false
        cloned[p.key] = (v as Array<{ label: string }>).map((it) => ({
          label: it.label,
          done: false,
        }));
      } else if (p.type === 'date') {
        // 날짜는 새로 입력하도록 비움
        // (특별히 세팅 안 함)
      } else if (p.type === 'files') {
        // 파일은 복제 안 함 (URL 만 복사하면 같은 파일 가리킴 — 의도와 다를 수 있음)
        // 필요하면 사용자가 시트에서 같은 파일 다시 첨부
      } else {
        cloned[p.key] = v;
      }
    }
    setDuplicateData({ data: cloned, sourceTitle });
  };

  // 텍스트로 새 항목 자동 채우기
  const aiFillFromText = async () => {
    if (!aiText.trim() || aiFillBusy) return;
    setAiFillBusy(true);
    setAiFillError(null);
    try {
      const res = await fetch(`/api/archive/collections/${id}/ai-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setAiFillResult({
        data: j.data ?? {},
        filled: j.filled ?? [],
        missing: j.missing ?? [],
        sourceText: aiText.trim(),
      });
      setAiTextModalOpen(false);
      setAiText('');
    } catch (e) {
      setAiFillError(e instanceof Error ? e.message : '실패');
    } finally {
      setAiFillBusy(false);
    }
  };

  // 한 칸 이동 — 검색 중에는 비활성
  const moveEntry = async (idx: number, dir: -1 | 1) => {
    if (busy) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= entries.length) return;
    const next = entries.slice();
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setEntries(next);
    setBusy(true);
    try {
      await fetch(`/api/archive/collections/${id}/entries/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: next.map((e) => e.id) }),
      });
    } finally {
      setBusy(false);
    }
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
            onClick={() => {
              setNotionModalOpen(true);
              setNotionResult(null);
              setNotionPreview(null);
              setNotionError(null);
              loadTokenStatus();
            }}
            className="p-2 rounded-xl text-gray-500 active:bg-gray-100"
            aria-label="노션 가져오기"
            title="노션 DB 가져오기"
          >
            📥
          </button>
          <button
            onClick={() => {
              setExportModalOpen(true);
              setExportResult(null);
              setExportError(null);
              loadTokenStatus();
            }}
            className="p-2 rounded-xl text-gray-500 active:bg-gray-100"
            aria-label="노션 내보내기"
            title="노션으로 내보내기"
          >
            📤
          </button>
          <button
            onClick={() => setEditingSchema(true)}
            className="p-2 rounded-xl text-gray-500 active:bg-gray-100 mr-12"
            aria-label="설정"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 pb-2 space-y-2">
        {/* 검색 + 필터 토글 */}
        {entries.length > 0 && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="제목/메모/태그 안에서 검색"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-gray-100 text-sm focus:outline-none focus:bg-white focus:ring-2 focus:ring-violet-200"
              />
            </div>
            {(() => {
              const filterableCount = ((collection?.schema ?? []) as ArchiveProperty[]).filter(
                (p) => ['select', 'multiselect', 'rating', 'checkbox', 'date', 'number', 'currency'].includes(p.type),
              ).length;
              if (filterableCount === 0) return null;
              const activeCount = Object.entries(filters).filter(([, v]) => {
                if (v == null) return false;
                if (typeof v === 'string') return v.length > 0;
                if (Array.isArray(v)) return v.length > 0;
                if (typeof v === 'number') return v > 0;
                if (typeof v === 'object')
                  return Object.values(v as Record<string, unknown>).some(
                    (x) => x != null && x !== '',
                  );
                return false;
              }).length;
              return (
                <button
                  onClick={() => setFiltersOpen((p) => !p)}
                  className={`px-3 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-1 ${
                    activeCount > 0
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  aria-label="필터"
                >
                  <Filter size={15} />
                  {activeCount > 0 && (
                    <span className="text-xs font-bold">{activeCount}</span>
                  )}
                </button>
              );
            })()}
          </div>
        )}

        {/* 필터 패널 */}
        {filtersOpen && entries.length > 0 && (
          <FilterPanel
            schema={(collection?.schema ?? []) as ArchiveProperty[]}
            filters={filters}
            onChange={setFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            onClear={() => {
              setFilters({});
              setSortBy(null);
            }}
          />
        )}

        {/* 새 항목 + 사진 추가 + 순서 변경 */}
        <div className="flex gap-2">
          <button
            onClick={() => setEditingEntry('new')}
            className="flex-1 py-3 rounded-2xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1 active:bg-violet-700"
          >
            <Plus size={16} /> 새 항목
          </button>
          <button
            onClick={() => {
              setAiText('');
              setAiFillError(null);
              setAiTextModalOpen(true);
            }}
            disabled={aiFillBusy}
            className="px-3 py-3 rounded-2xl bg-white border border-violet-200 text-violet-600 text-sm font-semibold inline-flex items-center gap-1 active:bg-violet-50 disabled:opacity-50"
            title="텍스트로 추가 — AI 가 분석해서 자동 채워줘요"
          >
            {aiFillBusy ? (
              <><Loader2 size={14} className="animate-spin" /> 분석 중</>
            ) : (
              <><Sparkles size={14} /> AI 추가</>
            )}
          </button>
          {entries.length >= 3 && (
            <button
              onClick={() => setAnalyzeOpen(true)}
              className="px-3 py-3 rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white text-sm font-semibold inline-flex items-center gap-1 active:opacity-80"
              title="AI 분석 — 차트 + 인사이트"
            >
              <Sparkles size={14} /> 분석
            </button>
          )}
          {entries.length > 1 && (
            <button
              onClick={() => setReorderMode((v) => !v)}
              className={`px-3 py-3 rounded-2xl text-sm font-semibold inline-flex items-center gap-1 ${
                reorderMode
                  ? 'bg-amber-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-50'
              }`}
              title="순서 이동"
            >
              <ArrowUpDown size={14} />
              {reorderMode ? '완료' : '순서'}
            </button>
          )}
        </div>
        {aiFillError && (
          <div className="text-[11px] text-rose-500 px-1 mt-1">{aiFillError}</div>
        )}

        {/* 뷰 모드 토글 */}
        <div className="flex items-center gap-1 pt-1">
          <div className="inline-flex bg-gray-100 rounded-xl p-0.5">
            <button
              onClick={() => changeViewMode('list')}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'list' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              <List size={12} /> 리스트
            </button>
            <button
              onClick={() => changeViewMode('gallery')}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'gallery' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              <LayoutGrid size={12} /> 갤러리
            </button>
            <button
              onClick={() => changeViewMode('table')}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'table' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              <TableIcon size={12} /> 표
            </button>
            <button
              onClick={() => {
                if (selectProps.length === 0) {
                  alert('select 타입 속성이 있어야 보드 뷰를 사용할 수 있어요. 컬렉션 설정에서 select 속성을 추가해주세요.');
                  return;
                }
                changeViewMode('board');
              }}
              disabled={selectProps.length === 0}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                viewMode === 'board' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
              }`}
              title={selectProps.length === 0 ? 'select 속성이 필요해요' : ''}
            >
              <Columns3 size={12} /> 보드
            </button>
            <button
              onClick={() => changeViewMode('calendar')}
              className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1 text-[11px] font-semibold transition-colors ${
                viewMode === 'calendar' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500'
              }`}
              title={dateProps.length === 0 ? '활동 세션만 표시 (date 속성 추가 시 더 풍부)' : ''}
            >
              <CalendarIcon size={12} /> 캘린더
            </button>
          </div>
          {/* 캘린더 모드일 때 date 속성 선택 (여러 개일 때) */}
          {viewMode === 'calendar' && dateProps.length > 1 && (
            <>
              <select
                value={calendarDateKey}
                onChange={(e) => setCalendarDateKey(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                {dateProps.map((p) => (
                  <option key={p.key} value={p.key}>
                    시작: {p.label}
                  </option>
                ))}
              </select>
              <select
                value={calendarEndDateKey}
                onChange={(e) => setCalendarEndDateKey(e.target.value)}
                className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white"
                title="기간 표시용 종료일 (선택)"
              >
                <option value="">종료일 없음</option>
                {dateProps
                  .filter((p) => p.key !== calendarDateKey)
                  .map((p) => (
                    <option key={p.key} value={p.key}>
                      종료: {p.label}
                    </option>
                  ))}
              </select>
            </>
          )}
          {/* 캘린더 모드일 때 세션 표시 토글 */}
          {viewMode === 'calendar' && (
            <label className="text-[11px] inline-flex items-center gap-1 text-gray-600">
              <input
                type="checkbox"
                checked={calendarShowSessions}
                onChange={(e) => setCalendarShowSessions(e.target.checked)}
                className="accent-amber-500"
              />
              ⏱ 활동 세션
            </label>
          )}
          {/* 보드 모드일 때 select 속성 선택 (여러 개일 때) */}
          {viewMode === 'board' && selectProps.length > 1 && (
            <select
              value={boardGroupKey}
              onChange={(e) => setBoardGroupKey(e.target.value)}
              className="text-[11px] border border-gray-200 rounded-lg px-2 py-1 bg-white"
            >
              {selectProps.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label} 기준
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className={`mx-auto px-4 space-y-2 pt-3 ${viewMode === 'table' || viewMode === 'board' ? 'max-w-full' : 'max-w-lg'}`}>
        {viewMode === 'board' && boardGroupKey ? (
          <ArchiveBoardView
            entries={filteredEntries}
            schema={(collection?.schema ?? []) as ArchiveProperty[]}
            groupKey={boardGroupKey}
            onSelectEntry={(eid) => {
              const found = entries.find((x) => x.id === eid);
              if (found) setEditingEntry(found);
            }}
            onCreateInColumn={(gKey, val) => {
              setDuplicateData({
                data: { [gKey]: val },
                sourceTitle: '',
              });
              setEditingEntry('new');
            }}
          />
        ) : viewMode === 'table' ? (
          <ArchiveTableView
            entries={filteredEntries}
            schema={(collection?.schema ?? []) as ArchiveProperty[]}
            onSelectEntry={(eid) => {
              const found = entries.find((x) => x.id === eid);
              if (found) setEditingEntry(found);
            }}
            onCellSave={async (entryId, propKey, value) => {
              const target = entries.find((x) => x.id === entryId);
              if (!target) return;
              const newData = {
                ...((target.data ?? {}) as Record<string, unknown>),
                [propKey]: value,
              };
              const res = await fetch(`/api/archive/entries/${entryId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: newData }),
              });
              if (!res.ok) throw new Error('저장 실패');
              setEntries((prev) =>
                prev.map((x) => (x.id === entryId ? { ...x, data: newData } : x)),
              );
            }}
          />
        ) : viewMode === 'calendar' ? (
          <ArchiveCalendarView
            entries={filteredEntries}
            schema={(collection?.schema ?? []) as ArchiveProperty[]}
            dateKey={calendarDateKey}
            endDateKey={calendarEndDateKey || undefined}
            collectionId={collection?.id}
            showSessions={calendarShowSessions}
            onSelectDate={(entryId, date) => {
              if (entryId) {
                const found = entries.find((e) => e.id === entryId);
                if (found) setEditingEntry(found);
              } else if (date && calendarDateKey) {
                // 빈 날짜 — 새 항목 만들면서 그 날짜 prefill (date 속성 있을 때만)
                setDuplicateData({
                  data: { [calendarDateKey]: date },
                  sourceTitle: '',
                });
                setEditingEntry('new');
              } else if (date) {
                // date 속성 없으면 그냥 새 항목
                setEditingEntry('new');
              }
            }}
          />
        ) : filteredEntries.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-12">
            {search ? '검색 결과 없음' : '아직 항목이 없어요. 첫 항목을 추가해보세요.'}
          </div>
        ) : (
          filteredEntries.map((e, idx) => {
            const data = (e.data ?? {}) as Record<string, unknown>;
            const titleProp = schema[0];
            const titleValue = titleProp ? data[titleProp.key] : null;
            // 검색 중에는 reorder 비활성 (인덱스가 다름)
            const showReorder = reorderMode && !search.trim();
            // entries (전체) 에서의 실제 인덱스
            const realIdx = entries.findIndex((x) => x.id === e.id);

            // gallery 모드 — 첫 'files' 속성에서 첫 이미지 추출
            const cardLayout = viewMode === 'gallery' ? 'gallery' : 'list';
            let coverUrl: string | null = null;
            if (cardLayout === 'gallery') {
              for (const p of schema) {
                if (p.type !== 'files') continue;
                const arr = Array.isArray(data[p.key])
                  ? (data[p.key] as Array<{ url?: string; name?: string; type?: string }>)
                  : [];
                const firstImg = arr.find((f) => {
                  if (!f?.url) return false;
                  if ((f.type ?? '').startsWith('image/')) return true;
                  return /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(f.name ?? f.url ?? '');
                });
                if (firstImg?.url) {
                  coverUrl = firstImg.url;
                  break;
                }
              }
            }

            const card = (
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="text-base font-bold text-gray-900 leading-tight">
                  {String(titleValue ?? '(제목 없음)')}
                </div>
                <div className="space-y-1 text-[12px] text-gray-600">
                  {schema.slice(1).map((p) => {
                    const val = data[p.key];
                    if (val == null || val === '') return null;
                    const display = formatPropertyDisplay(p, val);
                    if (!display) return null;
                    if (p.type === 'url') {
                      return (
                        <div key={p.key} className="flex items-baseline gap-1.5">
                          <span className="text-gray-400 shrink-0">{p.label}</span>
                          <a
                            href={String(val)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(ev) => ev.stopPropagation()}
                            className="text-violet-600 inline-flex items-center gap-0.5 hover:underline truncate"
                          >
                            🔗 링크 <ExternalLink size={10} />
                          </a>
                        </div>
                      );
                    }
                    if (p.type === 'longtext') {
                      return (
                        <div key={p.key} className="space-y-0.5">
                          <span className="text-[11px] text-gray-400">{p.label}</span>
                          <p
                            className="text-gray-700 leading-relaxed whitespace-pre-wrap"
                            style={{
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {String(val)}
                          </p>
                        </div>
                      );
                    }
                    if (p.type === 'checklist') {
                      const arr = Array.isArray(val)
                        ? (val as Array<{ done?: boolean }>)
                        : [];
                      if (arr.length === 0) return null;
                      const done = arr.filter((x) => x.done).length;
                      const pct = (done / arr.length) * 100;
                      const allDone = done === arr.length;
                      return (
                        <div key={p.key} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-gray-400">{p.label}</span>
                            <span
                              className={`text-[11px] font-semibold ${
                                allDone ? 'text-emerald-600' : 'text-gray-600'
                              }`}
                            >
                              {allDone ? '✓ 완료' : `${done}/${arr.length}`}
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                allDone ? 'bg-emerald-500' : 'bg-violet-400'
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={p.key} className="flex items-baseline gap-1.5">
                        <span className="text-gray-400 shrink-0">{p.label}</span>
                        <span className="text-gray-700 truncate">{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            if (showReorder) {
              return (
                <div
                  key={e.id}
                  className="flex items-center bg-white rounded-2xl border border-amber-200 px-3 py-2.5 gap-2"
                >
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => moveEntry(realIdx, -1)}
                      disabled={realIdx === 0 || busy}
                      className="p-1 rounded text-amber-600 disabled:opacity-30 active:bg-amber-50"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => moveEntry(realIdx, 1)}
                      disabled={realIdx === entries.length - 1 || busy}
                      className="p-1 rounded text-amber-600 disabled:opacity-30 active:bg-amber-50"
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  {card}
                </div>
              );
            }

            return (
              <button
                key={e.id}
                onClick={() => setEditingEntry(e)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 active:bg-gray-50 flex items-stretch gap-0 overflow-hidden"
              >
                {coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    className="w-24 h-auto self-stretch object-cover shrink-0 bg-gray-100"
                    style={{ minHeight: 80 }}
                  />
                )}
                <div className="flex-1 min-w-0 px-4 py-3 flex items-center gap-2">
                  {card}
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
          onDuplicate={(e) => {
            setEditingEntry(null);
            duplicateEntry(e);
          }}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            load();
          }}
        />
      )}

      {/* 기존 항목에서 복제된 새 entry 시트 */}
      {duplicateData && (
        <EntryFormSheet
          collectionId={id}
          schema={schema}
          color={collection.color}
          entry={null}
          prefillData={duplicateData.data}
          prefillBanner={
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 flex items-start gap-2">
              <span className="text-lg shrink-0">📋</span>
              <div className="flex-1 text-[11px] text-emerald-800 min-w-0">
                <div className="font-bold mb-1">
                  &ldquo;{duplicateData.sourceTitle}&rdquo; 에서 복제됨
                </div>
                <div className="text-emerald-700">
                  체크리스트는 모두 미체크 상태로 초기화됐어요.
                  날짜/제목 새로 입력하고 저장하세요.
                </div>
              </div>
              <button
                onClick={() => setDuplicateData(null)}
                className="p-1 text-emerald-500 hover:bg-emerald-100 rounded shrink-0"
                aria-label="취소"
              >
                <XIcon size={14} />
              </button>
            </div>
          }
          onClose={() => setDuplicateData(null)}
          onSaved={() => {
            setDuplicateData(null);
            load();
          }}
        />
      )}

      {/* 사진 OCR 결과로 채워진 새 항목 시트 */}
      {aiFillResult && (
        <EntryFormSheet
          collectionId={id}
          schema={schema}
          color={collection.color}
          entry={null}
          prefillData={aiFillResult.data}
          prefillBanner={
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 text-[11px] text-violet-800 min-w-0">
                  <div className="font-bold mb-1 inline-flex items-center gap-1">
                    <Sparkles size={11} /> AI 가 자동으로 채웠어요
                  </div>
                  <div>
                    채움: {aiFillResult.filled.length}개
                    {aiFillResult.missing.length > 0 && (
                      <>
                        {' · '}비어있음:{' '}
                        <span className="text-violet-500">
                          {aiFillResult.missing.join(', ')}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="text-violet-500 mt-0.5">
                    검토 후 저장하세요. 부정확하면 직접 수정해도 됩니다.
                  </div>
                  <details className="mt-1 text-violet-500">
                    <summary className="cursor-pointer">원본 텍스트</summary>
                    <p className="mt-1 px-2 py-1.5 bg-white rounded text-violet-900 whitespace-pre-wrap leading-relaxed text-[11px] max-h-32 overflow-y-auto">
                      {aiFillResult.sourceText}
                    </p>
                  </details>
                </div>
                <button
                  onClick={() => setAiFillResult(null)}
                  className="p-1 text-violet-500 hover:bg-violet-100 rounded shrink-0"
                  aria-label="닫기"
                >
                  <XIcon size={14} />
                </button>
              </div>
            </div>
          }
          onClose={() => setAiFillResult(null)}
          onSaved={() => {
            setAiFillResult(null);
            load();
          }}
        />
      )}

      {/* AI 텍스트 입력 모달 */}
      {aiTextModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !aiFillBusy && setAiTextModalOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-bold text-gray-900 inline-flex items-center gap-1.5">
                <Sparkles size={16} className="text-violet-600" /> AI 자동 입력
              </h3>
              <button
                onClick={() => !aiFillBusy && setAiTextModalOpen(false)}
                disabled={aiFillBusy}
                className="p-1 rounded text-gray-500 hover:bg-gray-100"
                aria-label="닫기"
              >
                <XIcon size={16} />
              </button>
            </div>
            <div className="px-5 pb-4 space-y-2 overflow-y-auto">
              <div className="text-xs text-gray-500 leading-relaxed">
                자유롭게 적어주세요. AI 가 컬렉션 속성에 맞춰 자동으로 분류해서 채워줍니다.
                예: <span className="text-violet-700">와인 라벨/뉴스/리뷰/메모/대화</span> 어떤 형식이든 OK.
              </div>
              <div className="text-[10px] text-gray-400">
                속성: {schema.map((p) => p.label).join(' · ')}
              </div>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder='예) "어제 본 영화 인터스텔라. 별 5개. 크리스토퍼 놀란 감독, SF 장르. 엄마랑 같이 봤음. 너무 감동적이었다."'
                rows={8}
                autoFocus
                disabled={aiFillBusy}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:border-violet-400 focus:outline-none resize-y bg-white"
              />
              {aiFillError && (
                <div className="text-[11px] text-rose-500 px-1">{aiFillError}</div>
              )}
            </div>
            <div className="px-5 pt-2 pb-6 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => !aiFillBusy && setAiTextModalOpen(false)}
                disabled={aiFillBusy}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={aiFillFromText}
                disabled={!aiText.trim() || aiFillBusy}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {aiFillBusy ? (
                  <><Loader2 size={14} className="animate-spin" /> 분석 중…</>
                ) : (
                  <><Sparkles size={14} /> AI 분석</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 노션 임포트 모달 */}
      {notionModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !notionBusy && closeNotion()}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-bold text-gray-900 inline-flex items-center gap-1.5">
                📥 노션에서 가져오기
              </h3>
              <button
                onClick={() => !notionBusy && closeNotion()}
                disabled={notionBusy}
                className="p-1 rounded text-gray-500 hover:bg-gray-100"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-4 space-y-3 flex-1">
              {!notionResult ? (
                <>
                  {/* 노션 토큰 상태 */}
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
                    {tokenStatus === null ? (
                      <div className="text-[11px] text-gray-400">상태 확인 중…</div>
                    ) : !tokenStatus.encryption_available ? (
                      <div className="text-[11px] text-rose-600 leading-relaxed">
                        ⚠️ 암호화 키 (APP_ENCRYPTION_KEY) 가 Vercel 환경변수에
                        설정돼 있지 않아 토큰을 안전하게 저장할 수 없어요.
                        <br />
                        먼저 Vercel Settings → Environment Variables 에
                        <code className="bg-rose-100 px-1 rounded mx-0.5">APP_ENCRYPTION_KEY</code>
                        (32자 이상 랜덤 문자열) 추가 후 재배포 해주세요.
                      </div>
                    ) : tokenStatus.set ? (
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
                          <Check size={12} className="text-emerald-600" />
                          노션 토큰 등록됨
                          <span className="text-emerald-500 font-mono">
                            {tokenStatus.masked}
                          </span>
                        </span>
                        <button
                          onClick={deleteToken}
                          className="text-[11px] text-rose-500 hover:underline"
                        >
                          삭제
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] font-semibold text-gray-700">
                          🔑 노션 통합 토큰 등록 필요
                        </div>
                        <ol className="text-[11px] text-gray-600 list-decimal pl-4 space-y-0.5 leading-relaxed">
                          <li>
                            <a
                              href="https://www.notion.so/profile/integrations"
                              target="_blank"
                              rel="noreferrer"
                              className="text-violet-600 underline"
                            >
                              notion.so/profile/integrations
                            </a>{' '}
                            접속
                          </li>
                          <li>+ New integration → Internal → 이름 아무거나</li>
                          <li>발급된 시크릿(secret_xxx) 복사 → 아래 붙여넣기</li>
                          <li>가져올 노션 DB 페이지에서 ⋯ → Connections → 만든 통합 추가</li>
                        </ol>
                        <input
                          type="password"
                          value={tokenInput}
                          onChange={(e) => setTokenInput(e.target.value)}
                          placeholder="ntn_xxxxxxxxxxxxxxxx 또는 secret_xxxxxxx"
                          disabled={tokenSaving}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono"
                        />
                        <button
                          onClick={saveToken}
                          disabled={!tokenInput.trim() || tokenSaving}
                          className="w-full py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                        >
                          {tokenSaving ? <><Loader2 size={12} className="animate-spin" /> 저장 중…</> : '🔒 암호화하여 저장'}
                        </button>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                          AES-256-GCM 으로 암호화 후 DB 저장. 평문은 절대 저장되지 않으며,
                          API 응답에도 마스킹된 형태로만 노출됩니다.
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed">
                    노션 DB의 페이지들을 이 컬렉션 ({collection.name}) 의 항목으로 가져옵니다.
                  </p>
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">
                      노션 DB ID 또는 URL
                    </label>
                    <input
                      value={notionDbId}
                      onChange={(e) => setNotionDbId(e.target.value)}
                      placeholder="https://www.notion.so/xxx?v=yyy 또는 32자 ID"
                      disabled={notionBusy || !tokenStatus?.set}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400 disabled:bg-gray-50 disabled:opacity-50"
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      노션 DB 페이지에서 ⋯ → 링크 복사 → 여기에 붙여넣기.
                    </p>
                  </div>

                  {notionError && (
                    <div className="text-[11px] text-rose-500 px-1 bg-rose-50 border border-rose-100 rounded p-2">
                      {notionError}
                    </div>
                  )}

                  {notionPreview && (
                    <div className="space-y-3">
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-violet-900 mb-2">
                          속성 매칭 ({notionPreview.suggestions.filter((s) => s.archive_key).length}/
                          {notionPreview.suggestions.length})
                        </div>
                        <ul className="space-y-1">
                          {notionPreview.suggestions.map((s) => (
                            <li
                              key={s.notion}
                              className="flex items-center justify-between text-[11px]"
                            >
                              <span className="text-violet-800">
                                {s.notion} <span className="text-violet-400">({s.notion_type})</span>
                              </span>
                              <span
                                className={s.archive_label ? 'text-emerald-600 font-semibold' : 'text-gray-400'}
                              >
                                {s.archive_label ? `→ ${s.archive_label}` : '— (스킵됨)'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-[10px] text-violet-500 mt-2">
                          속성 이름이 비슷한 것끼리 자동 매칭됨. 매칭 안 된 노션 속성은 무시돼요.
                          매칭이 안 맞으면 컬렉션의 속성 라벨을 노션과 같게 바꾸세요.
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-gray-700 mb-1.5">
                          미리보기 (처음 {notionPreview.preview.length}건)
                        </div>
                        <ul className="space-y-2">
                          {notionPreview.preview.map((entry, i) => (
                            <li key={i} className="text-[11px] text-gray-700">
                              {Object.entries(entry)
                                .map(([k, v]) => {
                                  const label = schema.find((p) => p.key === k)?.label ?? k;
                                  const display =
                                    Array.isArray(v) ? `[${v.length}]` : String(v).slice(0, 30);
                                  return `${label}: ${display}`;
                                })
                                .join(' · ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                  <div className="text-3xl mb-2">✅</div>
                  <div className="text-sm font-bold text-emerald-800">가져오기 완료</div>
                  <div className="text-xs text-emerald-700 mt-1">
                    가져옴: {notionResult.imported}건
                    {notionResult.skipped > 0 && ` · 스킵: ${notionResult.skipped}건`}
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 pt-2 pb-6 border-t border-gray-100 flex gap-2">
              {!notionResult ? (
                <>
                  <button
                    onClick={closeNotion}
                    disabled={notionBusy}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold disabled:opacity-50"
                  >
                    취소
                  </button>
                  {!notionPreview ? (
                    <>
                      <button
                        onClick={() => notionPreviewFetch(false)}
                        disabled={!notionDbId.trim() || notionBusy || !tokenStatus?.set}
                        className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1"
                      >
                        {notionBusy ? <><Loader2 size={14} className="animate-spin" /> 미리보기</> : '미리보기'}
                      </button>
                      <button
                        onClick={() => notionPreviewFetch(true)}
                        disabled={!notionDbId.trim() || notionBusy || !tokenStatus?.set}
                        className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1"
                        title="AI 가 속성 의미를 보고 매칭"
                      >
                        <Sparkles size={14} /> AI 매핑
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={notionImportRun}
                      disabled={notionBusy}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1"
                    >
                      {notionBusy ? <><Loader2 size={14} className="animate-spin" /> 가져오는 중…</> : '✅ 가져오기 실행'}
                    </button>
                  )}
                </>
              ) : (
                <button
                  onClick={closeNotion}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 노션 export 모달 */}
      {exportModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !exportBusy && closeExport()}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3">
              <h3 className="text-base font-bold text-gray-900 inline-flex items-center gap-1.5">
                📤 노션으로 내보내기
              </h3>
              <button
                onClick={() => !exportBusy && closeExport()}
                disabled={exportBusy}
                className="p-1 rounded text-gray-500 hover:bg-gray-100"
              >
                <XIcon size={16} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 pb-4 space-y-3 flex-1">
              {!exportResult ? (
                <>
                  {!tokenStatus?.set && (
                    <div className="text-[11px] text-rose-600 bg-rose-50 border border-rose-100 rounded p-2">
                      ⚠️ 노션 토큰이 등록되지 않았어요. 📥 가져오기에서 먼저 등록해주세요.
                    </div>
                  )}
                  <p className="text-xs text-gray-500 leading-relaxed">
                    이 컬렉션의 {entries.length}개 항목을 노션 페이지로 만듭니다.
                    체크리스트는 <code className="bg-gray-100 px-1 rounded">[x] / [ ]</code> 텍스트로 평탄화돼요.
                  </p>

                  {/* 모드 선택 */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setExportTarget('new')}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border ${
                        exportTarget === 'new'
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      🆕 새 DB 만들기
                    </button>
                    <button
                      onClick={() => setExportTarget('existing')}
                      className={`px-3 py-2.5 rounded-xl text-sm font-semibold border ${
                        exportTarget === 'existing'
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >
                      📂 기존 DB 에 추가
                    </button>
                  </div>

                  {exportTarget === 'new' ? (
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">
                        부모 페이지 ID 또는 URL
                      </label>
                      <input
                        value={exportPageId}
                        onChange={(e) => setExportPageId(e.target.value)}
                        placeholder="https://www.notion.so/페이지URL 또는 32자 ID"
                        disabled={exportBusy}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400"
                      />
                      <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                        노션에 빈 페이지 만들고 ⋯ → Connections 로 통합 공유 → 그 페이지 링크 복사 → 여기 붙여넣기.
                        그 페이지 안에 새 DB 가 생성돼요.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <label className="text-[11px] text-gray-500 mb-1 block">
                        기존 노션 DB ID 또는 URL
                      </label>
                      <input
                        value={exportDbId}
                        onChange={(e) => setExportDbId(e.target.value)}
                        placeholder="https://www.notion.so/xxx?v=yyy"
                        disabled={exportBusy}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-violet-400"
                      />
                      <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">
                        ⚠️ 기존 DB 의 속성 이름이 이 컬렉션의 속성 이름(label) 과
                        같아야 매칭됩니다. 다르면 새 DB 만들기를 추천해요.
                      </p>
                    </div>
                  )}

                  {exportError && (
                    <div className="text-[11px] text-rose-500 px-1 bg-rose-50 border border-rose-100 rounded p-2">
                      {exportError}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                  <div className="text-3xl">✅</div>
                  <div className="text-sm font-bold text-emerald-800">내보내기 완료</div>
                  <div className="text-xs text-emerald-700">
                    {exportResult.exported}/{exportResult.total} 페이지 생성
                  </div>
                  {exportResult.database_url && (
                    <a
                      href={exportResult.database_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold mt-1"
                    >
                      🔗 노션에서 열기
                    </a>
                  )}
                  {exportResult.errors.length > 0 && (
                    <details className="text-left">
                      <summary className="text-[11px] text-rose-500 cursor-pointer">
                        에러 {exportResult.errors.length}건
                      </summary>
                      <ul className="text-[10px] text-rose-600 mt-1 space-y-0.5">
                        {exportResult.errors.map((er, i) => (
                          <li key={i} className="break-all">{er}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 pt-2 pb-6 border-t border-gray-100 flex gap-2">
              {!exportResult ? (
                <>
                  <button
                    onClick={closeExport}
                    disabled={exportBusy}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={runExport}
                    disabled={exportBusy || !tokenStatus?.set}
                    className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1"
                  >
                    {exportBusy ? <><Loader2 size={14} className="animate-spin" /> 내보내는 중…</> : '📤 내보내기'}
                  </button>
                </>
              ) : (
                <button
                  onClick={closeExport}
                  className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold"
                >
                  닫기
                </button>
              )}
            </div>
          </div>
        </div>
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

      {/* AI 분석 모달 */}
      <AnalyzeModal
        open={analyzeOpen}
        onClose={() => setAnalyzeOpen(false)}
        collectionId={collection?.id ?? ''}
        collectionName={collection?.name ?? ''}
      />
    </div>
  );
}

// ─────────────────────────────────────────
// 항목 편집 시트
// ─────────────────────────────────────────
function EntryFormSheet({
  collectionId,
  schema: initialSchema,
  color,
  entry,
  prefillData,
  prefillBanner,
  onDuplicate,
  onClose,
  onSaved,
}: {
  collectionId: string;
  schema: ArchiveProperty[];
  color: string;
  entry: ArchiveEntry | null;
  prefillData?: Record<string, unknown>;
  prefillBanner?: React.ReactNode;
  onDuplicate?: (entry: ArchiveEntry) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [schema, setSchema] = useState<ArchiveProperty[]>(initialSchema);
  const [data, setData] = useState<Record<string, unknown>>(() => {
    if (entry?.data) return entry.data as Record<string, unknown>;
    // 새 항목: schema 의 checklist 기본 항목으로 자동 채움 (template 동작)
    const init: Record<string, unknown> = {};
    for (const p of initialSchema) {
      if (p.type === 'checklist' && p.options && p.options.length > 0) {
        init[p.key] = p.options.map((label) => ({ label, done: false }));
      }
    }
    // AI prefill 이 있으면 그걸로 덮어쓰기
    if (prefillData) {
      for (const [k, v] of Object.entries(prefillData)) init[k] = v;
    }
    return init;
  });
  // 기존 항목은 보기 모드로 시작, 새 항목/AI prefill 은 편집 모드
  const [mode, setMode] = useState<'view' | 'edit'>(
    entry && !prefillData ? 'view' : 'edit',
  );
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiIntent, setAiIntent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<ArchiveProperty['type']>('text');
  void color;

  const aiAddProperty = async () => {
    if (!aiIntent.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      // 새 ai-schema 엔드포인트 — 추가/수정/삭제/이동 모두 지원
      const res = await fetch(
        `/api/archive/collections/${collectionId}/ai-schema`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: aiIntent.trim(),
            currentSchema: schema,
          }),
        },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      const newSchema = (j.schema ?? schema) as ArchiveProperty[];
      // entry form 안에서는 즉시 DB 반영 (기존 직접추가 흐름과 동일)
      await fetch(`/api/archive/collections/${collectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: newSchema }),
      });
      setSchema(newSchema);
      setAiIntent('');
      setAiMode(false);
      setAdding(false);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '실패');
    } finally {
      setAiBusy(false);
    }
  };

  const addProperty = async () => {
    if (!newLabel.trim()) return;
    // key 자동 생성 (한글이면 field_N)
    const baseKey = newLabel
      .trim()
      .toLowerCase()
      .replace(/[^\w가-힣]/g, '_')
      .replace(/[가-힣]/g, '');
    const key = baseKey || `field_${schema.length + 1}`;
    const exists = schema.some((p) => p.key === key);
    const finalKey = exists ? `${key}_${schema.length + 1}` : key;
    const newProp: ArchiveProperty = {
      key: finalKey,
      label: newLabel.trim(),
      type: newType,
    };
    const updatedSchema = [...schema, newProp];
    // 컬렉션 스키마 즉시 업데이트
    await fetch(`/api/archive/collections/${collectionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: updatedSchema }),
    });
    setSchema(updatedSchema);
    setNewLabel('');
    setNewType('text');
    setAdding(false);
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (entry) {
        await fetch(`/api/archive/entries/${entry.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
        // 기존 항목 수정 후에는 view 모드로 복귀 + 부모 새로고침
        setMode('view');
        onSaved();
      } else {
        await fetch(`/api/archive/collections/${collectionId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
        onSaved();
      }
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
            {mode === 'view' ? '항목' : entry ? '항목 수정' : '새 항목'}
          </h3>
          {mode === 'view' && (
            <div className="flex items-center gap-3">
              {entry && onDuplicate && (
                <button
                  onClick={() => onDuplicate(entry)}
                  className="text-sm font-semibold text-emerald-600 inline-flex items-center gap-1"
                  title="이 항목을 복제해서 새 항목 만들기"
                >
                  📋 복제
                </button>
              )}
              <button
                onClick={() => setMode('edit')}
                className="text-sm font-semibold text-violet-600 inline-flex items-center gap-1"
              >
                ✏️ 수정
              </button>
            </div>
          )}
        </div>

        <div className="overflow-y-auto px-5 pb-6 space-y-4">
          {prefillBanner}

          {mode === 'view' ? (
            // ─── 보기 모드 ─────────────────────────
            <div className="space-y-4">
              {/* 제목 (첫 속성) 크게 */}
              {schema[0] && (
                <div>
                  <div className="text-[11px] text-gray-400 mb-1">{schema[0].label}</div>
                  <div className="text-xl font-bold text-gray-900 leading-snug">
                    {String(data[schema[0].key] ?? '(제목 없음)')}
                  </div>
                </div>
              )}

              {/* 나머지 속성 */}
              {schema.slice(1).map((p) => {
                const val = data[p.key];
                const display = formatPropertyDisplay(p, val);
                if (!display && p.type !== 'longtext') {
                  return (
                    <div key={p.key}>
                      <div className="text-[11px] text-gray-400 mb-1">{p.label}</div>
                      <div className="text-sm text-gray-300">—</div>
                    </div>
                  );
                }
                return (
                  <div key={p.key}>
                    <div className="text-[11px] text-gray-400 mb-1">{p.label}</div>
                    {p.type === 'url' && val ? (
                      <a
                        href={String(val)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-violet-600 hover:underline inline-flex items-center gap-1 break-all"
                      >
                        {String(val)} <ExternalLink size={12} className="shrink-0" />
                      </a>
                    ) : p.type === 'longtext' ? (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {(val as string) || <span className="text-gray-300">—</span>}
                      </p>
                    ) : p.type === 'checklist' ? (
                      (() => {
                        const arr = Array.isArray(val)
                          ? (val as Array<{ label: string; done: boolean }>)
                          : [];
                        if (arr.length === 0)
                          return <span className="text-sm text-gray-300">—</span>;
                        const done = arr.filter((x) => x.done).length;
                        return (
                          <div>
                            <div className="text-[11px] text-gray-500 mb-1">
                              {done}/{arr.length} 완료
                            </div>
                            <ul className="space-y-1">
                              {arr.map((it, i) => (
                                <li key={i} className="flex items-center gap-2 text-sm">
                                  <span
                                    className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                      it.done
                                        ? 'bg-violet-600 border-violet-600 text-white'
                                        : 'bg-white border-gray-300'
                                    }`}
                                  >
                                    {it.done && <span className="text-[10px] leading-none">✓</span>}
                                  </span>
                                  <span
                                    className={
                                      it.done
                                        ? 'line-through text-gray-400'
                                        : 'text-gray-800'
                                    }
                                  >
                                    {it.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()
                    ) : p.type === 'files' ? (
                      (() => {
                        const arr = Array.isArray(val)
                          ? (val as Array<{ url: string; name: string; type?: string }>)
                          : [];
                        if (arr.length === 0)
                          return <span className="text-sm text-gray-300">—</span>;
                        return (
                          <div className="grid grid-cols-3 gap-2">
                            {arr.map((f, i) => {
                              const isImage =
                                (f.type ?? '').startsWith('image/') ||
                                /\.(png|jpe?g|gif|webp|svg|bmp|heic|heif)$/i.test(
                                  f.name ?? f.url,
                                );
                              return (
                                <a
                                  key={i}
                                  href={f.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center"
                                >
                                  {isImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={f.url}
                                      alt={f.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="flex flex-col items-center text-center p-2">
                                      <span className="text-2xl">📎</span>
                                      <span className="text-[10px] text-gray-600 truncate max-w-full">
                                        {f.name}
                                      </span>
                                    </div>
                                  )}
                                </a>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {display}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* 연결된 할일/일정 (양방향 relation) */}
              {entry && (
                <div className="pt-2">
                  <div className="text-[11px] text-gray-400 mb-1.5 inline-flex items-center gap-1">
                    <span>🔗</span> 연결된 할일/일정
                  </div>
                  <LinkedTasksList entryId={entry.id} />
                </div>
              )}
            </div>
          ) : (
            schema.map((p) => (
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
            ))
          )}

          {/* 속성 추가 — 편집 모드일 때만 */}
          {mode === 'edit' && adding ? (
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-3 space-y-2">
              {/* 모드 토글 */}
              <div className="flex gap-1 p-0.5 bg-white rounded-lg">
                <button
                  onClick={() => setAiMode(false)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded ${
                    !aiMode ? 'bg-violet-600 text-white' : 'text-gray-500'
                  }`}
                >
                  직접 입력
                </button>
                <button
                  onClick={() => setAiMode(true)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded inline-flex items-center justify-center gap-1 ${
                    aiMode ? 'bg-violet-600 text-white' : 'text-gray-500'
                  }`}
                >
                  <Sparkles size={11} /> AI 추천
                </button>
              </div>

              {aiMode ? (
                <>
                  <div className="text-xs font-semibold text-violet-700">
                    AI 에게 무엇을 요청할까요?
                  </div>
                  <textarea
                    value={aiIntent}
                    onChange={(e) => setAiIntent(e.target.value)}
                    placeholder='추가/수정/삭제/이동 모두 가능. 예: "별점 추가", "memo 빼줘", "리뷰는 긴 텍스트로", "별점을 첫번째로"'
                    rows={2}
                    autoFocus
                    className="w-full px-3 py-2 border border-violet-200 rounded-xl text-sm bg-white resize-none"
                  />
                  {aiError && (
                    <div className="text-[11px] text-rose-500">{aiError}</div>
                  )}
                  <div className="text-[11px] text-violet-600 leading-relaxed">
                    AI 가 자연어 명령으로 속성을 추가·수정·삭제·이동합니다. 즉시 저장돼요.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAdding(false);
                        setAiMode(false);
                      }}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm"
                    >
                      취소
                    </button>
                    <button
                      onClick={aiAddProperty}
                      disabled={!aiIntent.trim() || aiBusy}
                      className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                    >
                      {aiBusy ? (
                        <><Loader2 size={12} className="animate-spin" /> AI 적용 중…</>
                      ) : (
                        <><Sparkles size={12} /> AI 적용</>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold text-violet-700">새 속성 추가</div>
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="속성 이름 (예: 시청 날짜, 함께 본 사람)"
                    autoFocus
                    className="w-full px-3 py-2 border border-violet-200 rounded-xl text-sm bg-white"
                  />
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ArchiveProperty['type'])}
                    className="w-full px-3 py-2 border border-violet-200 rounded-xl text-sm bg-white"
                  >
                    <option value="text">짧은 텍스트</option>
                    <option value="longtext">긴 텍스트</option>
                    <option value="number">숫자</option>
                    <option value="currency">금액</option>
                    <option value="date">날짜</option>
                    <option value="url">URL</option>
                    <option value="select">단일 선택</option>
                    <option value="multiselect">복수 선택</option>
                    <option value="rating">별점</option>
                    <option value="checkbox">체크박스</option>
                    <option value="files">파일/사진</option>
                    <option value="checklist">체크리스트</option>
                    <option value="relation">🔗 관계 (다른 컬렉션)</option>
                    <option value="rollup">∑ Rollup (집계)</option>
                    <option value="formula">ƒ Formula (수식)</option>
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAdding(false)}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm"
                    >
                      취소
                    </button>
                    <button
                      onClick={addProperty}
                      disabled={!newLabel.trim()}
                      className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      추가
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : mode === 'edit' ? (
            <button
              onClick={() => setAdding(true)}
              className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-gray-500 text-sm font-semibold inline-flex items-center justify-center gap-1 active:bg-gray-50"
            >
              <Plus size={14} /> 속성 추가 / AI 편집
            </button>
          ) : null}

          {/* 액션 버튼 */}
          {mode === 'view' ? (
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
                닫기
              </button>
              <button
                onClick={() => setMode('edit')}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-1"
              >
                ✏️ 수정
              </button>
            </div>
          ) : (
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
                onClick={() => {
                  // 기존 항목 편집 중 취소면 view 로 복귀, 신규면 시트 닫기
                  if (entry) {
                    setData((entry.data as Record<string, unknown>) ?? {});
                    setMode('view');
                  } else {
                    onClose();
                  }
                }}
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
          )}
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
  const [cardLayout, setCardLayout] = useState<'list' | 'gallery'>(
    collection.card_layout === 'gallery' ? 'gallery' : 'list',
  );
  const [busy, setBusy] = useState(false);

  // 다른 컬렉션 목록 (relation/rollup 용)
  const [allCollections, setAllCollections] = useState<
    Array<{ id: string; name: string; emoji: string; schema: ArchiveProperty[] }>
  >([]);
  useEffect(() => {
    fetch('/api/archive/collections')
      .then((r) => r.json())
      .then((j) => {
        setAllCollections(
          (j.collections ?? []).map((c: ArchiveCollection) => ({
            id: c.id,
            name: c.name,
            emoji: c.emoji,
            schema: (c.schema ?? []) as ArchiveProperty[],
          })),
        );
      })
      .catch(() => {});
  }, []);

  // AI 편집
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIntent, setAiIntent] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const aiEditSchema = async () => {
    if (!aiIntent.trim() || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch(
        `/api/archive/collections/${collection.id}/ai-schema`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: aiIntent.trim(),
            currentSchema: schema,
          }),
        },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      setSchema(j.schema as ArchiveProperty[]);
      setAiSummary(j.summary ?? '업데이트됨');
      setAiIntent('');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : '실패');
    } finally {
      setAiBusy(false);
    }
  };

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
        body: JSON.stringify({ name, emoji, description, schema, card_layout: cardLayout }),
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
    files: '파일/사진',
    checklist: '체크리스트',
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

          {/* 카드 레이아웃 */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">카드 표시</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCardLayout('list')}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border ${
                  cardLayout === 'list'
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                📝 텍스트
              </button>
              <button
                type="button"
                onClick={() => setCardLayout('gallery')}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border ${
                  cardLayout === 'gallery'
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                🖼 사진 표지
              </button>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
              사진 표지: 첨부파일 속성 안의 첫 번째 이미지가 카드 좌측 표지로 노출돼요.
            </p>
          </div>

          {/* 속성 편집 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500 font-semibold">속성</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAiOpen((v) => !v);
                    setAiError(null);
                    setAiSummary(null);
                  }}
                  className={`text-xs font-semibold inline-flex items-center gap-0.5 ${
                    aiOpen ? 'text-violet-700' : 'text-violet-600'
                  }`}
                >
                  <Sparkles size={12} /> AI 편집
                </button>
                <button
                  onClick={addProp}
                  className="text-xs text-gray-600 font-semibold inline-flex items-center gap-0.5"
                >
                  <Plus size={12} /> 직접 추가
                </button>
              </div>
            </div>

            {/* AI 편집 패널 */}
            {aiOpen && (
              <div className="mb-3 rounded-2xl bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 p-3 space-y-2">
                <div className="text-[11px] text-violet-700 leading-relaxed">
                  자연어로 명령하세요. 예:<br />
                  · "memo 속성 빼줘" · "리뷰는 긴 텍스트로 바꿔줘"<br />
                  · "별점을 첫번째로 옮겨줘" · "사진 url 추가"
                </div>
                <textarea
                  value={aiIntent}
                  onChange={(e) => setAiIntent(e.target.value)}
                  placeholder="예) 날짜 삭제하고 별점을 위로 올려줘"
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-violet-200 text-sm focus:outline-none focus:border-violet-400 resize-none placeholder-gray-400"
                  disabled={aiBusy}
                />
                {aiError && (
                  <div className="text-[11px] text-rose-500 px-1">{aiError}</div>
                )}
                {aiSummary && (
                  <div className="text-[11px] text-violet-700 px-1 inline-flex items-center gap-1">
                    <Sparkles size={10} /> {aiSummary} — 미리보기 적용됨. 저장 눌러야 확정.
                  </div>
                )}
                <button
                  onClick={aiEditSchema}
                  disabled={!aiIntent.trim() || aiBusy}
                  className="w-full py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                >
                  {aiBusy ? (
                    <><Loader2 size={12} className="animate-spin" /> AI 편집 중…</>
                  ) : (
                    <><Sparkles size={12} /> AI 적용</>
                  )}
                </button>
              </div>
            )}
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
                        // 타이핑 중에는 trim/filter 하지 않음 → 콤마 입력 가능
                        updateProp(i, {
                          options: e.target.value.split(','),
                        })
                      }
                      onBlur={(e) =>
                        // 포커스 빠질 때만 정리
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
                  {/* Relation: 대상 컬렉션 + 다중 허용 */}
                  {p.type === 'relation' && (
                    <div className="space-y-1.5 bg-violet-50/50 rounded-lg p-2 border border-violet-100">
                      <p className="text-[10px] font-bold text-violet-700">
                        🔗 어떤 컬렉션과 연결할까요?
                      </p>
                      {allCollections.length <= 1 ? (
                        <div className="text-[10px] text-rose-500 bg-white rounded px-2 py-1.5">
                          연결할 다른 컬렉션이 아직 없어요. 다른 컬렉션을 먼저 만들어주세요.
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-1">
                          {allCollections
                            .filter((c) => c.id !== collection.id)
                            .map((c) => {
                              const isSelected = p.target_collection_id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    updateProp(i, { target_collection_id: c.id })
                                  }
                                  className={`text-left text-[11px] px-2 py-1.5 rounded-lg border transition-colors ${
                                    isSelected
                                      ? 'bg-violet-600 text-white border-violet-600'
                                      : 'bg-white border-gray-200 hover:border-violet-300'
                                  }`}
                                >
                                  <span className="mr-1">{c.emoji}</span>
                                  <span className="truncate">{c.name}</span>
                                  <span className={`text-[9px] block mt-0.5 ${isSelected ? 'text-violet-200' : 'text-gray-400'}`}>
                                    속성 {c.schema.length}개
                                  </span>
                                </button>
                              );
                            })}
                        </div>
                      )}
                      {p.target_collection_id && (
                        <label className="flex items-center gap-1 text-[11px] text-gray-700 pt-1">
                          <input
                            type="checkbox"
                            checked={p.allow_multiple !== false}
                            onChange={(e) =>
                              updateProp(i, { allow_multiple: e.target.checked })
                            }
                            className="accent-violet-600"
                          />
                          여러 항목 연결 허용 (켜두면 한 항목에 여러 개 묶을 수 있음)
                        </label>
                      )}
                      <p className="text-[9px] text-gray-400 leading-tight">
                        예: 여행 → 준비물 / 책 → 저자 / 영화 → 감독
                      </p>
                    </div>
                  )}
                  {/* Rollup: 어느 relation 통해 + 어느 속성 + 집계 */}
                  {p.type === 'rollup' && (() => {
                    const relationProps = schema.filter(
                      (sp) => sp.type === 'relation' && sp.target_collection_id,
                    );
                    const sourceRel = relationProps.find(
                      (sp) => sp.key === p.source_relation_key,
                    );
                    const targetCol = sourceRel
                      ? allCollections.find(
                          (c) => c.id === sourceRel.target_collection_id,
                        )
                      : null;
                    return (
                      <div className="space-y-1">
                        <select
                          value={p.source_relation_key ?? ''}
                          onChange={(e) =>
                            updateProp(i, { source_relation_key: e.target.value || undefined })
                          }
                          className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                        >
                          <option value="">관계 속성 선택</option>
                          {relationProps.map((sp) => (
                            <option key={sp.key} value={sp.key}>
                              🔗 {sp.label}
                            </option>
                          ))}
                        </select>
                        <select
                          value={p.target_property_key ?? ''}
                          onChange={(e) =>
                            updateProp(i, { target_property_key: e.target.value || undefined })
                          }
                          disabled={!targetCol}
                          className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white disabled:opacity-50"
                        >
                          <option value="">대상 속성 선택</option>
                          {(targetCol?.schema ?? []).map((sp) => (
                            <option key={sp.key} value={sp.key}>
                              {sp.label} ({sp.type})
                            </option>
                          ))}
                        </select>
                        <select
                          value={p.aggregation ?? 'count'}
                          onChange={(e) =>
                            updateProp(i, {
                              aggregation: e.target.value as ArchiveProperty['aggregation'],
                            })
                          }
                          className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                        >
                          <option value="count">개수 (count)</option>
                          <option value="count_distinct">고유 개수</option>
                          <option value="sum">합계</option>
                          <option value="avg">평균</option>
                          <option value="min">최소</option>
                          <option value="max">최대</option>
                          <option value="show_original">첫 값 그대로</option>
                          <option value="concat">콤마로 연결</option>
                        </select>
                      </div>
                    );
                  })()}
                  {/* Formula: 식 */}
                  {p.type === 'formula' && (
                    <div className="space-y-1">
                      <input
                        value={p.formula ?? ''}
                        onChange={(e) =>
                          updateProp(i, { formula: e.target.value })
                        }
                        placeholder="예: {price} * {quantity}"
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white font-mono"
                      />
                      <select
                        value={p.return_type ?? 'number'}
                        onChange={(e) =>
                          updateProp(i, {
                            return_type: e.target.value as ArchiveProperty['return_type'],
                          })
                        }
                        className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                      >
                        <option value="number">숫자</option>
                        <option value="text">문자</option>
                        <option value="date">날짜</option>
                      </select>
                      <p className="text-[10px] text-gray-400">
                        다른 속성은 {'{key}'} 로 참조. +, -, *, /, ()
                      </p>
                    </div>
                  )}
                  {p.type === 'checklist' && (
                    <div>
                      <textarea
                        value={(p.options ?? []).join('\n')}
                        onChange={(e) =>
                          updateProp(i, {
                            options: e.target.value
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder={'기본 항목 (한 줄에 하나씩)\n예) 여권\n충전기\n옷 2벌'}
                        rows={Math.min(8, Math.max(4, (p.options ?? []).length + 1))}
                        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded bg-white resize-y"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        새 항목 추가 시 이 목록이 미체크 상태로 자동으로 채워져요.
                      </p>
                    </div>
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
