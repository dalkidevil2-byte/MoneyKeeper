import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const DEFAULT_HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID!;

export async function GET() {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('wishlists')
    .select('*')
    .eq('household_id', DEFAULT_HOUSEHOLD_ID)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wishlists: data });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();

  const { data, error } = await supabase
    .from('wishlists')
    .insert({
      household_id: DEFAULT_HOUSEHOLD_ID,
      name: body.name,
      price: body.price ?? 0,
      priority: body.priority ?? 'medium',
      category_main: body.category_main ?? '',
      category_sub: body.category_sub ?? '',
      url: body.url ?? '',
      image_url: body.image_url ?? '',
      memo: body.memo ?? '',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wishlist: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data, error } = await supabase
    .from('wishlists')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ wishlist: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await supabase
    .from('wishlists')
    .update({ status: 'cancelled' })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
