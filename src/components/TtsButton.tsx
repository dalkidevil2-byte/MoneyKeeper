'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, Square, Loader2 } from 'lucide-react';

/**
 * 텍스트를 음성으로 읽어주는 버튼.
 * - 클릭 → /api/tts → audio 재생
 * - 재생 중엔 정지 버튼
 * - audio Blob 캐시 (같은 텍스트 다시 누르면 재요청 X)
 */
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
    if (busy || !text.trim()) return;
    setError(null);

    // 캐시 hit
    const key = `${voice}|${text}`;
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
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? '실패');
      }
      const blob = await res.blob();
      // 이전 캐시 정리
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
      {error ? <span className="text-rose-500">{error}</span> : <span>{playing ? '정지' : label}</span>}
    </button>
  );
}
