'use client';

import { useEffect, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';
const nowKst = () => dayjs().tz(KST);

/**
 * 자정에 자동 갱신되는 "오늘" 날짜 키.
 * - 다음 자정까지 setTimeout 으로 갱신 예약
 * - visibilitychange / focus 시에도 날짜가 바뀌었으면 즉시 갱신
 * - 갱신 시 onRollover 콜백 (있으면) 실행 → 데이터 refetch 등
 */
export function useToday(onRollover?: () => void): string {
  const [todayKey, setTodayKey] = useState(() => nowKst().format('YYYY-MM-DD'));

  const tick = useCallback(() => {
    const next = nowKst().format('YYYY-MM-DD');
    setTodayKey((prev) => {
      if (prev !== next) {
        // 비동기로 호출해서 setState 사이클 분리
        setTimeout(() => onRollover?.(), 0);
        return next;
      }
      return prev;
    });
  }, [onRollover]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      // 다음 자정까지의 ms (+1초 안전 마진)
      const now = nowKst();
      const nextMidnight = now.add(1, 'day').startOf('day');
      const delay = Math.max(1000, nextMidnight.diff(now) + 1000);
      timer = setTimeout(() => {
        tick();
        schedule();
      }, delay);
    };
    schedule();

    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    const onFocus = () => tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [tick]);

  return todayKey;
}
