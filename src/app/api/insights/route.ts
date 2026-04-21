export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

// 단가/반복 구매 분석이 부적절한 카테고리 (쇼핑·취미 등은 개별 품목이 다 다르므로)
const NON_RECURRING_CATEGORIES = new Set([
  '쇼핑',
  '의료',
  '교육',
  '취미',
  '출장',
  '경조사',
  '주거',
  '저축/투자',
]);

export async function GET() {
  const supabase = createServerSupabaseClient();
  const today = dayjs();
  const threeMonthsAgo = today.subtract(3, 'month').format('YYYY-MM-DD');

  const { data: txs } = await supabase
    .from('transactions')
    .select('id, date, amount, name, merchant_name, category_main, type')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .in('type', ['variable_expense', 'fixed_expense'])
    .neq('status', 'cancelled')
    .gte('date', threeMonthsAgo)
    .order('date', { ascending: true });

  if (!txs || txs.length === 0) return NextResponse.json({ insights: [] });

  const insights: any[] = [];

  // ── 1. 반복 가맹점 분석 (쇼핑·취미 등은 제외) ──
  const merchantMap: Record<string, { dates: string[]; amounts: number[]; category: string }> = {};
  for (const tx of txs) {
    if (NON_RECURRING_CATEGORIES.has(tx.category_main)) continue;
    const key = tx.merchant_name || tx.name;
    if (!key || key.length < 2) continue;
    if (!merchantMap[key]) merchantMap[key] = { dates: [], amounts: [], category: tx.category_main };
    merchantMap[key].dates.push(tx.date);
    merchantMap[key].amounts.push(tx.amount);
  }

  const recurringMerchants = Object.entries(merchantMap)
    .filter(([, v]) => v.dates.length >= 2)
    .map(([merchant, v]) => {
      const dates = v.dates.map((d) => dayjs(d));
      const gaps: number[] = [];
      for (let i = 1; i < dates.length; i++) {
        gaps.push(dates[i].diff(dates[i - 1], 'day'));
      }
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const avgAmount = Math.round(v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length);
      const lastDate = dates[dates.length - 1];
      const daysSinceLast = today.diff(lastDate, 'day');

      let frequency: 'weekly' | 'biweekly' | 'monthly' | null = null;
      if (avgGap <= 10) frequency = 'weekly';
      else if (avgGap <= 20) frequency = 'biweekly';
      else if (avgGap <= 45) frequency = 'monthly';

      return {
        merchant,
        frequency,
        avgGap: Math.round(avgGap),
        avgAmount,
        visitCount: v.dates.length,
        lastDate: lastDate.format('YYYY-MM-DD'),
        daysSinceLast,
        category: v.category,
      };
    })
    .filter((m) => m.frequency !== null || m.visitCount >= 2)
    .sort((a, b) => b.visitCount - a.visitCount);

  // 주기 초과된 가맹점 → "아직 안 가셨네요" 알림
  for (const m of recurringMerchants.slice(0, 5)) {
    const threshold = m.frequency === 'weekly' ? 10 : m.frequency === 'biweekly' ? 18 : 40;
    if (m.daysSinceLast > threshold) {
      insights.push({
        type: 'overdue_merchant',
        merchant: m.merchant,
        frequency: m.frequency,
        daysSinceLast: m.daysSinceLast,
        avgAmount: m.avgAmount,
        category: m.category,
        avgGap: m.avgGap,
      });
    }
  }

  // 상위 반복 가맹점 TOP 3
  for (const m of recurringMerchants.slice(0, 3)) {
    // overdue로 이미 추가된 항목은 제외
    const alreadyAdded = insights.some((i) => i.type === 'overdue_merchant' && i.merchant === m.merchant);
    if (!alreadyAdded) {
      insights.push({
        type: 'recurring_merchant',
        merchant: m.merchant,
        frequency: m.frequency,
        avgAmount: m.avgAmount,
        visitCount: m.visitCount,
        lastDate: m.lastDate,
        daysSinceLast: m.daysSinceLast,
        category: m.category,
      });
    }
  }

  // ── 2. 이번 달 vs 전달 카테고리 급증 ──
  const thisMonthStart = today.startOf('month').format('YYYY-MM-DD');
  const lastMonthStart = today.subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const lastMonthEnd = today.subtract(1, 'month').endOf('month').format('YYYY-MM-DD');

  const catThis: Record<string, number> = {};
  const catLast: Record<string, number> = {};

  for (const tx of txs) {
    if (!tx.category_main) continue;
    if (tx.date >= thisMonthStart) {
      catThis[tx.category_main] = (catThis[tx.category_main] ?? 0) + tx.amount;
    } else if (tx.date >= lastMonthStart && tx.date <= lastMonthEnd) {
      catLast[tx.category_main] = (catLast[tx.category_main] ?? 0) + tx.amount;
    }
  }

  for (const [cat, thisAmt] of Object.entries(catThis)) {
    const lastAmt = catLast[cat] ?? 0;
    if (lastAmt === 0 || thisAmt < 10000) continue;
    const pct = Math.round(((thisAmt - lastAmt) / lastAmt) * 100);
    if (pct >= 30) {
      insights.push({
        type: 'category_spike',
        category: cat,
        thisMonth: thisAmt,
        lastMonth: lastAmt,
        pct,
      });
    }
  }

  // ── 3. 자주 구매하는 품목 (OCR로 저장된 개별 품목, 쇼핑·취미 제외) ──
  const itemMap: Record<string, { count: number; amounts: number[]; dates: string[] }> = {};
  for (const tx of txs) {
    if (NON_RECURRING_CATEGORIES.has(tx.category_main)) continue;
    // OCR 품목은 merchant_name이 가게명, name이 품목명으로 다름
    if (tx.merchant_name && tx.name && tx.merchant_name !== tx.name && tx.name.length >= 2) {
      const key = tx.name;
      if (!itemMap[key]) itemMap[key] = { count: 0, amounts: [], dates: [] };
      itemMap[key].count++;
      itemMap[key].amounts.push(tx.amount);
      itemMap[key].dates.push(tx.date);
    }
  }

  const topItems = Object.entries(itemMap)
    .filter(([, v]) => v.count >= 2)
    .map(([name, v]) => ({
      name,
      count: v.count,
      avgAmount: Math.round(v.amounts.reduce((s, a) => s + a, 0) / v.amounts.length),
      lastDate: v.dates[v.dates.length - 1],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  if (topItems.length > 0) {
    insights.push({ type: 'frequent_items', items: topItems });
  }

  return NextResponse.json({ insights: insights.slice(0, 6) });
}
