import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 서버사이드 전용 (API Routes에서 사용)
export const createServerSupabaseClient = () =>
  createClient(supabaseUrl, supabaseAnonKey);
