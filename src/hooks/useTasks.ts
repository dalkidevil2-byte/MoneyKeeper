'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Task, CreateTaskInput, TodayTask } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

interface UseTasksParams {
  from?: string;
  to?: string;
  status?: string;
  member_id?: string;
  type?: 'one_time' | 'routine';
  category_main?: string;
  include_cancelled?: boolean;
  include_completions?: boolean;
  enabled?: boolean;
}

export function useTasks(params: UseTasksParams = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryKey = useMemo(() => JSON.stringify(params), [params]);

  const fetchTasks = useCallback(() => {
    if (params.enabled === false) {
      setLoading(false);
      return;
    }
    const sp = new URLSearchParams({ household_id: HOUSEHOLD_ID });
    if (params.from) sp.set('from', params.from);
    if (params.to) sp.set('to', params.to);
    if (params.status) sp.set('status', params.status);
    if (params.member_id) sp.set('member_id', params.member_id);
    if (params.type) sp.set('type', params.type);
    if (params.category_main) sp.set('category_main', params.category_main);
    if (params.include_cancelled) sp.set('include_cancelled', '1');
    if (params.include_completions) sp.set('include_completions', '1');

    setLoading(true);
    setError(null);
    fetch(`/api/tasks?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        setTasks(d.tasks ?? []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}

interface TodayResponse {
  date: string;
  today: TodayTask[];
  overdue: TodayTask[];
  counts: { today_total: number; today_done: number; overdue: number };
}

export function useTodayTasks(memberId?: string) {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchToday = useCallback(() => {
    const sp = new URLSearchParams({ household_id: HOUSEHOLD_ID });
    if (memberId) sp.set('member_id', memberId);
    setLoading(true);
    fetch(`/api/tasks/today?${sp.toString()}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [memberId]);

  useEffect(() => {
    fetchToday();
  }, [fetchToday]);

  return { data, loading, refetch: fetchToday };
}

export function useSaveTask() {
  const create = useCallback(async (input: CreateTaskInput) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, household_id: input.household_id ?? HOUSEHOLD_ID }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '저장 실패');
    return data.task as Task;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Task>) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '수정 실패');
    return data.task as Task;
  }, []);

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? '삭제 실패');
    }
  }, []);

  return { create, update, remove };
}

export function useCompleteTask() {
  const complete = useCallback(
    async (id: string, completed_on?: string, member_id?: string | null) => {
      const res = await fetch(`/api/tasks/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed_on, member_id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '완료 처리 실패');
      return data;
    },
    []
  );

  const uncomplete = useCallback(async (id: string, date?: string) => {
    const sp = date ? `?date=${date}` : '';
    const res = await fetch(`/api/tasks/${id}/complete${sp}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? '완료 취소 실패');
    }
  }, []);

  return { complete, uncomplete };
}
