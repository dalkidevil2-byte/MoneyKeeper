'use client';

import { useEffect, useRef, useState } from 'react';
import { Volume2, Square } from 'lucide-react';

/**
 * 텍스트를 음성으로 읽어주는 버튼.
 * - 브라우저 내장 Web Speech API (speechSynthesis) 사용 → 무료, 오프라인 지원
 * - 한국어 음성이 있으면 우선 선택
 * - voice prop 은 호환성 위해 남겨두지만 무시됨
 */
export default function TtsButton({
  text,
  className,
  label = '듣기',
}: {
  text: string;
  voice?: 'nova' | 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'coral';
  className?: string;
  label?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  const supported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  const pickKoreanVoice = (): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    // 한국어 음성 우선 (ko-KR > ko)
    const ko =
      voices.find((v) => v.lang === 'ko-KR') ||
      voices.find((v) => v.lang.startsWith('ko'));
    return ko ?? null;
  };

  const play = async () => {
    if (!supported) {
      setError('브라우저 미지원');
      return;
    }
    if (!text.trim()) return;
    setError(null);

    // voices 가 비동기 로드되는 경우 한 번 기다림
    let voicesReady = window.speechSynthesis.getVoices().length > 0;
    if (!voicesReady) {
      await new Promise<void>((resolve) => {
        const t = setTimeout(() => resolve(), 500);
        window.speechSynthesis.onvoiceschanged = () => {
          clearTimeout(t);
          resolve();
        };
      });
    }

    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    const koVoice = pickKoreanVoice();
    if (koVoice) u.voice = koVoice;
    u.rate = 1.0;
    u.pitch = 1.0;
    u.onend = () => setPlaying(false);
    u.onerror = () => {
      setPlaying(false);
      setError('재생 실패');
    };
    utterRef.current = u;
    setPlaying(true);
    window.speechSynthesis.cancel(); // 진행 중인 거 정지
    window.speechSynthesis.speak(u);
  };

  const stop = () => {
    if (supported) window.speechSynthesis.cancel();
    setPlaying(false);
  };

  return (
    <button
      onClick={playing ? stop : play}
      disabled={!supported || !text.trim()}
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
      {playing ? (
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
