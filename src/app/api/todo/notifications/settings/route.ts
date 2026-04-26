export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

const ALLOWED_LEAD = [0, 5, 10, 15, 30, 60, 120, 1440];

export async function GET(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const householdId =
    new URL(req.url).searchParams.get('household_id') ?? DEFAULT_HOUSEHOLD_ID;
  try {
    const { data } = await supabase
      .from('todo_notification_settings')
      .select('*')
      .eq('household_id', householdId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({
        settings: { household_id: householdId, lead_minutes: [30], enabled: true },
      });
    }
    return NextResponse.json({ settings: data });
  } catch (error: any) {
    console.error('[GET notifications/settings]', error);
    return NextResponse.json({ error: '설정을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const body = await req.json();
    const householdId = body.household_id ?? DEFAULT_HOUSEHOLD_ID;
    const lead: number[] = Array.isArray(body.lead_minutes)
      ? body.lead_minutes.filter((n: number) => ALLOWED_LEAD.includes(n))
      : [30];
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : true;
    const { data, error } = await supabase
      .from('todo_notification_settings')
      .upsert(
        {
          household_id: householdId,
          lead_minutes: lead.length > 0 ? lead : [30],
          enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'household_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error: any) {
    console.error('[PATCH notifications/settings]', error);
    return NextResponse.json({ error: '설정 저장 실패' }, { status: 500 });
  }
}
