export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('transaction_id', id)
    .order('created_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { items } = await req.json();
  if (!items?.length) return NextResponse.json({ items: [] });

  const rows = items.map((item: any) => ({
    transaction_id: id,
    name: String(item.name ?? '').trim(),
    quantity: Math.max(1, parseInt(item.quantity) || 1),
    price: parseInt(item.price) || 0,
    unit: item.unit || '개',
    category_main: item.category_main || '',
    category_sub: item.category_sub || '',
  })).filter((r: any) => r.name.length >= 1 && r.price > 0);

  if (!rows.length) return NextResponse.json({ items: [] });

  const { data, error } = await supabase.from('items').insert(rows).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');

  if (itemId) {
    const { error } = await supabase.from('items').delete().eq('id', itemId).eq('transaction_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase.from('items').delete().eq('transaction_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
