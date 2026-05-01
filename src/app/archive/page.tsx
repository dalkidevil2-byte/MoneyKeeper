'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Plus, ChevronRight, Sparkles } from 'lucide-react';
import type { ArchiveCollection } from '@/types';
import { ARCHIVE_TEMPLATES, BLANK_SCHEMA } from '@/lib/archive-templates';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export default function ArchivePage() {
  const [collections, setCollections] = useState<ArchiveCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-white pb-24">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 -ml-2 rounded-xl hover:bg-gray-100">
            <ChevronLeft size={22} className="text-gray-700" />
          </Link>
          <h1 className="text-lg font-bold text-gray-900 flex-1">📦 아카이브</h1>
          <button
            onClick={() => setCreating(true)}
            className="text-sm text-violet-600 font-semibold inline-flex items-center gap-1 mr-12"
          >
            <Plus size={16} /> 새 컬렉션
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-3">
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
        ) : (
          collections.map((c) => (
            <Link
              key={c.id}
              href={`/archive/${c.id}`}
              className="block bg-white rounded-2xl border border-gray-100 px-4 py-3 active:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                  style={{ backgroundColor: `${c.color}22` }}
                >
                  {c.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-900 truncate">
                    {c.name}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    {(c.entry_count ?? 0).toLocaleString('ko-KR')}건
                    {c.description && ` · ${c.description}`}
                  </div>
                </div>
                <ChevronRight size={18} className="text-gray-300 shrink-0" />
              </div>
            </Link>
          ))
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
