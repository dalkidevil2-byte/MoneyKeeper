'use client';

import { useEffect } from 'react';

/**
 * 구글 캘린더 자동 동기화 트리거.
 * - 마운트 시 1회
 * - visibilitychange (탭이 다시 visible 됐을 때)
 * - focus
 * 호출 후 변경 있으면 onChange() 콜백
 */
export function useGCalAutoSync(onChange?: () => void) {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const res = await fetch('/api/google-calendar/auto-sync', { method: 'POST' });
        if (!res.ok) return;
        const j = await res.json();
        if (cancelled || j?.status !== 'ok') return;
        const p = j.pulled ?? {};
        const changed =
          (p.created ?? 0) + (p.updated ?? 0) + (p.deleted ?? 0) > 0 ||
          (j.pushed ?? 0) > 0;
        if (changed) onChange?.();
      } catch {
        /* skip */
      }
    };

    void sync();

    const onVis = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const onFocus = () => void sync();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [onChange]);
}
