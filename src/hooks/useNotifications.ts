'use client';

import { useEffect, useState } from 'react';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export interface NotificationItem {
  task_id: string;
  title: string;
  due_at: string;       // ISO
  lead_minutes: number;
  remaining_min: number;
  member?: { id: string; name: string; color: string };
}

export function useNotifications(pollMs = 60_000) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      fetch(`/api/todo/notifications?household_id=${HOUSEHOLD_ID}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          setItems(d.notifications ?? []);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    tick();
    const id = setInterval(tick, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { items, loading };
}
