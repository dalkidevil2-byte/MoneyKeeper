'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Account, PaymentMethod, Member } from '@/types';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/accounts?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setAccounts(d.accounts ?? []))
      .finally(() => setLoading(false));
  }, []);

  return { accounts, loading };
}

export function usePaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/payment-methods?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setPaymentMethods(d.payment_methods ?? []))
      .finally(() => setLoading(false));
  }, []);

  return { paymentMethods, loading };
}

export function useMembers() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(() => {
    setLoading(true);
    fetch(`/api/members?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setMembers(d.members ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  return { members, loading, refetch: fetchMembers };
}

export function useCustomCategories() {
  const [categories, setCategories] = useState<{ id: string; category_main: string; category_sub: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(() => {
    setLoading(true);
    fetch('/api/custom-categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  return { categories, loading, refetch: fetchCategories };
}

export function useFixedExpenseTemplates() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(() => {
    setLoading(true);
    fetch('/api/fixed-expense-templates')
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  return { templates, loading, refetch: fetchTemplates };
}

export function useBudgets() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBudgets = () => {
    setLoading(true);
    fetch(`/api/budgets?household_id=${HOUSEHOLD_ID}`)
      .then((r) => r.json())
      .then((d) => setBudgets(d.budgets ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBudgets(); }, []);

  return { budgets, loading, refetch: fetchBudgets };
}
