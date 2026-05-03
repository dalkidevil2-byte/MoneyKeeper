'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';

/**
 * 텍스트를 음성으로 읽어주는 버튼.
 * - 클릭 → /api/tts (OpenAI tts-1, nova) → audio 재생
 * - 같은 텍스트는 Blob 캐시 (재호출 X)
 * - 이모지는 읽기 전에 제거
 */
function stripEmojis(text: string): string {
  // 이모지/픽토그램/심볼 제거. 한글/영문/숫자/기본 문장부호는 유지
  return text
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function TtsButton({
  text,
  voice = 'nova',
  className,
  label = '듣기',
}: {
  text: string;
  voice?: 'nova' | 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'coral';
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheUrlRef = useRef<string | null>(null);
  const cacheKeyRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (cacheUrlRef.current) URL.revokeObjectURL(cacheUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  const play = async () => {
    if (busy) return;
    const cleaned = stripEmojis(text);
    if (!cleaned) return;
    setError(null);

    const key = `${voice}|${cleaned}`;
    if (cacheKeyRef.current === key && cacheUrlRef.current) {
      const a = new Audio(cacheUrlRef.current);
      audioRef.current = a;
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setPlaying(false);
        setError('재생 실패');
      };
      setPlaying(true);
      try {
        await a.play();
      } catch {
        setPlaying(false);
        setError('재생 실패');
      }
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleaned, voice }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? '실패');
      }
      const blob = await res.blob();
      if (cacheUrlRef.current) URL.revokeObjectURL(cacheUrlRef.current);
      const url = URL.createObjectURL(blob);
      cacheUrlRef.current = url;
      cacheKeyRef.current = key;

      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => setPlaying(false);
      a.onerror = () => {
        setPlaying(false);
        setError('재생 실패');
      };
      setPlaying(true);
      await a.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : '실패');
    } finally {
      setBusy(false);
    }
  };

  const stop = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPlaying(false);
  };

  return (
    <button
      onClick={playing ? stop : play}
      disabled={busy || !text.trim()}
      className={
        className ??
        `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
          playing
            ? 'bg-rose-500 text-white'
            : 'bg-violet-100 text-violet-700 hover:bg-violet-200'
        }`
      }
      title={playing ? '정지' : `${label} (음성)`}
      aria-label={playing ? '정지' : label}
    >
      {busy ? (
        <Loader2 size={12} className="animate-spin" />
      ) : playing ? (
        <Square size={12} fill="currentColor" />
      ) : (
        <Volume2 size={12} />
      )}
      {error ? (
        <span className="text-rose-500">{error}</span>
      ) : (
        <span>{playing ? '정지' : label}</span>
      )}
    </button>
  );
}
