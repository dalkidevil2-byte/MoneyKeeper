'use client';

import { useEffect, useState } from 'react';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import TtsButton from '@/components/TtsButton';

const STORAGE_KEY = 'home:briefing_cache';
const COLLAPSED_KEY = 'home:briefing_collapsed';

type Mode = 'morning' | 'evening';
type Cached = {
  mode: Mode;
  date: string; // YYYY-MM-DD
  title: string;
  body: string;
};

function nowMode(): Mode {
  const h = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  return h >= 17 ? 'evening' : 'morning';
}

function todayKey(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default function BriefingCard() {
  const [data, setData] = useState<Cached | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // 캐시 불러오기 (오늘 날짜 + 같은 mode 면 재사용)
  useEffect(() => {
    try {
      const c = localStorage.getItem(COLLAPSED_KEY);
      if (c === '1') setCollapsed(true);
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Cached;
        if (cached.date === todayKey() && cached.mode === nowMode()) {
          setData(cached);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const fetchBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/briefing?mode=${nowMode()}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '실패');
      const c: Cached = {
        mode: nowMode(),
        date: todayKey(),
        title: j.title,
        body: j.body,
      };
      setData(c);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-4 border border-violet-100">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={toggleCollapsed}
          className="text-sm font-bold text-violet-900 inline-flex items-center gap-1"
          title={collapsed ? '펼치기' : '접기'}
        >
          <Sparkles size={14} /> AI 브리핑
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <div className="flex items-center gap-2">
          {data && !collapsed && (
            <button
              onClick={fetchBriefing}
              disabled={loading}
              className="text-violet-600 disabled:opacity-50"
              title="새로 받기"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          )}
          <button
            onClick={toggleCollapsed}
            className="text-xs text-violet-400"
          >
            {collapsed ? '펼치기' : '접기'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {!data && !loading && (
            <button
              onClick={fetchBriefing}
              className="w-full py-3 rounded-xl bg-white border border-violet-200 text-sm text-violet-700 font-semibold inline-flex items-center justify-center gap-1 active:bg-violet-50"
            >
              <Sparkles size={14} />
              {nowMode() === 'morning' ? '오늘의 브리핑 받기' : '오늘 회고 받기'}
            </button>
          )}

          {loading && !data && (
            <div className="flex items-center gap-2 py-3 text-sm text-violet-600">
              <Loader2 size={14} className="animate-spin" /> AI 가 정리 중…
            </div>
          )}

          {data && (
            <>
              <div className="text-sm font-bold text-gray-900 mb-1">{data.title}</div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {data.body}
              </p>
              <div className="mt-3 pt-3 border-t border-violet-100 flex justify-end">
                <TtsButton
                  text={`${data.title}. ${data.body}`}
                  label="음성으로 듣기"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold shadow-sm active:bg-violet-700 disabled:opacity-50"
                />
              </div>
            </>
          )}

          {error && (
            <div className="text-[11px] text-rose-500 mt-1">{error}</div>
          )}
        </>
      )}
    </div>
  );
}
