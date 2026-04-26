'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Goal, CreateGoalInput } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export function useGoals(status?: string) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    const sp = new URLSearchParams({ household_id: HOUSEHOLD_ID });
    if (status) sp.set('status', status);
    setLoading(true);
    fetch(`/api/goals?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setGoals(d.goals ?? []))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { goals, loading, refetch };
}

export function useSaveGoal() {
  const create = useCallback(async (input: CreateGoalInput): Promise<Goal> => {
    const res = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: HOUSEHOLD_ID, ...input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '저장 실패');
    return data.goal;
  }, []);
  const update = useCallback(async (id: string, patch: Partial<Goal>): Promise<Goal> => {
    const res = await fetch(`/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '수정 실패');
    return data.goal;
  }, []);
  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('삭제 실패');
  }, []);
  const incProgress = useCallback(async (id: string, delta = 1, note = '') => {
    await fetch(`/api/goals/${id}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta, note }),
    });
  }, []);
  const decProgress = useCallback(async (id: string) => {
    await fetch(`/api/goals/${id}/progress`, { method: 'DELETE' });
  }, []);
  return { create, update, remove, incProgress, decProgress };
}
