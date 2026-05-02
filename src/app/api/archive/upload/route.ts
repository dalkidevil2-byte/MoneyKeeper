export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const SUPA_BUCKET = 'archive';

// ─── Cloudflare R2 (S3 호환) — env 가 있으면 자동 사용 ──────
//   R2_ACCOUNT_ID         (또는 R2_ENDPOINT)
//   R2_ACCESS_KEY_ID
//   R2_SECRET_ACCESS_KEY
//   R2_BUCKET
//   R2_PUBLIC_BASE_URL    (예: https://pub-xxxxx.r2.dev 또는 자체 도메인)
const R2_BUCKET = process.env.R2_BUCKET ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ??
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '');
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL ?? '';

const R2_ENABLED = !!(
  R2_BUCKET &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_ENDPOINT &&
  R2_PUBLIC_BASE_URL
);

const r2Client = R2_ENABLED
  ? new S3Client({
      region: 'auto',
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/**
 * POST /api/archive/upload  (multipart/form-data: file)
 * R2 env 가 설정돼 있으면 R2 로, 없으면 Supabase Storage 'archive' 버킷으로.
 *
 * 응답: { url, path, name, size, type, storage: 'r2' | 'supabase' }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 });
    }
    const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase();
    const safeBase = (file.name || 'file')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w가-힣\-]/g, '_')
      .slice(0, 40);
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeBase}.${ext}`;

    if (R2_ENABLED && r2Client) {
      const buf = Buffer.from(await file.arrayBuffer());
      try {
        await r2Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: path,
            Body: buf,
            ContentType: file.type || undefined,
            CacheControl: 'public, max-age=31536000, immutable',
          }),
        );
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'R2 업로드 실패' },
          { status: 500 },
        );
      }
      const base = R2_PUBLIC_BASE_URL.replace(/\/+$/, '');
      const url = `${base}/${path}`;
      return NextResponse.json({
        url,
        path,
        name: file.name,
        size: file.size,
        type: file.type,
        storage: 'r2',
      });
    }

    // Fallback: Supabase Storage
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.storage
      .from(SUPA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint:
            "Supabase Storage 에 'archive' 버킷이 없다면 만들어주세요 (public read).",
        },
        { status: 500 },
      );
    }
    const { data } = supabase.storage.from(SUPA_BUCKET).getPublicUrl(path);
    return NextResponse.json({
      url: data.publicUrl,
      path,
      name: file.name,
      size: file.size,
      type: file.type,
      storage: 'supabase',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '실패' },
      { status: 500 },
    );
  }
}
