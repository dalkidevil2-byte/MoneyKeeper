export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
const KST = 'Asia/Seoul';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

/**
 * GET /api/ai-usage?household_id=...
 * 응답: 오늘 / 이번 달 합계 + 기능별 분해
 */
export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const householdId = searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;

  const now = dayjs().tz(KST);
  const todayStart = now.startOf('day').toISOString();
  const monthStart = now.startOf('month').toISOString();

  try {
    const { data, error } = await supabase
      .from('ai_usage')
      .select('feature, model, cost_krw, cost_usd, created_at')
      .eq('household_id', householdId)
      .gte('created_at', monthStart)
      .order('created_at', { ascending: false });
    if (error) throw error;

    type Row = {
      feature: string;
      model: string;
      cost_krw: number;
      cost_usd: number;
      created_at: string;
    };
    const rows = (data ?? []) as Row[];
    const todayRows = rows.filter((r) => r.created_at >= todayStart);

    const sum = (arr: Row[]) => ({
      krw: Math.round(arr.reduce((s, r) => s + Number(r.cost_krw ?? 0), 0) * 100) / 100,
      usd: Math.round(arr.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0) * 1000000) / 1000000,
      count: arr.length,
    });

    const groupBy = (arr: Row[], key: 'feature' | 'model') => {
      const map = new Map<string, Row[]>();
      for (const r of arr) {
        const k = r[key] ?? 'unknown';
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(r);
      }
      return Array.from(map.entries())
        .map(([k, list]) => ({ key: k, ...sum(list) }))
        .sort((a, b) => b.krw - a.krw);
    };

    return NextResponse.json({
      ok: true,
      today: sum(todayRows),
      month: sum(rows),
      todayByFeature: groupBy(todayRows, 'feature'),
      monthByFeature: groupBy(rows, 'feature'),
      monthByModel: groupBy(rows, 'model'),
      usdKrw: Number(process.env.USD_KRW ?? '1380'),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
