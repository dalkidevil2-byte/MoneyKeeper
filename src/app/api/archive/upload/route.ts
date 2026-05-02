export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

const BUCKET = 'archive';

/**
 * POST /api/archive/upload  (multipart/form-data: file)
 * 아카이브 첨부파일 업로드 → public URL 반환.
 *
 * Supabase Storage 의 `archive` 버킷이 미리 생성돼 있어야 함:
 *   - public read
 *   - 사용자만 insert 가능 (또는 anon insert)
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
    const safeBase = (file.name || 'file')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w가-힣\-]/g, '_')
      .slice(0, 40);
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}.${ext}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      // 버킷이 없으면 수동 생성하라고 안내
      return NextResponse.json(
        {
          error: error.message,
          hint:
            "Supabase Storage 에 'archive' 버킷이 없다면 만들어주세요 (public read 권장).",
        },
        { status: 500 },
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({
      url: data.publicUrl,
      path,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
