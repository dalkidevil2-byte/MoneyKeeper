'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Transaction, CreateTransactionInput, ParsedTransaction } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// ─────────────────────────────────────────
// 거래 목록 훅
// ─────────────────────────────────────────
export function useTransactions(filters?: {
  startDate?: string;
  endDate?: string;
  memberId?: string;
  type?: string;
}) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ household_id: HOUSEHOLD_ID });
      if (filters?.startDate) params.set('start_date', filters.startDate);
      if (filters?.endDate) params.set('end_date', filters.endDate);
      if (filters?.memberId) params.set('member_id', filters.memberId);
      if (filters?.type) params.set('type', filters.type);

      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransactions(data.transactions ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filters?.startDate, filters?.endDate, filters?.memberId, filters?.type]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  return { transactions, loading, error, refetch: fetchTransactions };
}

// ─────────────────────────────────────────
// 텍스트 파싱 훅
// ─────────────────────────────────────────
export function useParseText() {
  const [parsed, setParsed] = useState<ParsedTransaction | null>(null);
  const [parsing, setParsing] = useState(false);

  const parseText = useCallback(async (text: string) => {
    if (!text.trim()) { setParsed(null); return; }
    setParsing(true);
    try {
      const res = await fetch('/api/transactions/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setParsed(data.parsed);
    } catch {
      setParsed(null);
    } finally {
      setParsing(false);
    }
  }, []);

  return { parsed, parsing, parseText, clearParsed: () => setParsed(null) };
}

// ─────────────────────────────────────────
// 거래 저장 훅
// ─────────────────────────────────────────
export function useSaveTransaction() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTransaction = useCallback(async (input: CreateTransactionInput): Promise<Transaction | null> => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, household_id: input.household_id ?? HOUSEHOLD_ID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.transaction;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saveTransaction, saving, error };
}
