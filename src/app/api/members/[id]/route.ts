export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

// PATCH /api/members/[id] - 멤버 이름/색상 수정
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id } = await params;

  const allowed = ['name', 'color', 'is_active', 'telegram_chat_id', 'telegram_username'] as const;
  const update: Record<string, unknown> = {};
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, k)) update[k] = body[k];
  }

  const { data, error } = await supabase
    .from('members')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ member: data });
}
