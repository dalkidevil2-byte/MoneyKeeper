import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
// 서버 전용 — RLS 우회 가능. 클라이언트에 노출되면 절대 안 됨.
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 클라이언트 (브라우저) 용 — anon key.
// RLS Enable + 정책 없음 상태에서 anon 으로는 모든 SELECT/INSERT 거부됨.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 서버사이드 전용 (API Routes 에서만 호출).
 * service_role 가 있으면 그것을, 없으면 anon 으로 fallback (RLS 적용 받음).
 *
 * 절대 클라이언트 코드 ('use client' 컴포넌트) 에서 import 하지 말 것.
 * Next.js 가 import 추적해서 service_role 가 클라이언트 번들에 들어가는 것은
 * 막지 않음 — 사용 위치 주의 필수.
 */
export const createServerSupabaseClient = () =>
  createClient(supabaseUrl, supabaseServiceKey ?? supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
