export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('google_calendar_sync')
    .select('google_email, calendar_id, is_active, connected_at, last_synced_at')
    .eq('household_id', HOUSEHOLD_ID)
    .maybeSingle();

  if (!data || !data.is_active) {
    return NextResponse.json({ connected: false });
  }
  return NextResponse.json({
    connected: true,
    email: data.google_email,
    calendar_id: data.calendar_id,
    connected_at: data.connected_at,
    last_synced_at: data.last_synced_at,
  });
}

export async function DELETE() {
  const supabase = createServerSupabaseClient();
  await supabase
    .from('google_calendar_sync')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('household_id', HOUSEHOLD_ID);
  return NextResponse.json({ success: true });
}
