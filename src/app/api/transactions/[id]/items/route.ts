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

  const rows = items.map((item: any) => {
    const qty = parseFloat(item.quantity);
    return {
      transaction_id: id,
      name: String(item.name ?? '').trim(),
      quantity: isFinite(qty) && qty > 0 ? qty : 1,
      price: parseInt(item.price) || 0,
      unit: item.unit || '개',
      category_main: item.category_main || '',
      category_sub: item.category_sub || '',
    };
  }).filter((r: any) => r.name.length >= 1 && r.price > 0);

  if (!rows.length) {
    return NextResponse.json(
      { error: '품목명과 0원 초과 금액이 필요합니다.', items: [] },
      { status: 400 }
    );
  }

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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabaseClient();
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');
  const body = await req.json();

  if (!itemId) return NextResponse.json({ error: 'item_id required' }, { status: 400 });

  const updateFields: Record<string, any> = {
    category_main: body.category_main,
    category_sub: body.category_sub,
  };
  if (body.name !== undefined) updateFields.name = body.name;
  if (body.quantity !== undefined) updateFields.quantity = body.quantity;
  if (body.unit !== undefined) updateFields.unit = body.unit;
  if (body.price !== undefined) updateFields.price = body.price;

  const { data, error } = await supabase
    .from('items')
    .update(updateFields)
    .eq('id', itemId)
    .eq('transaction_id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
