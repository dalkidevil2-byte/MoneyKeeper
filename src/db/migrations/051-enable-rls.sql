-- public schema 의 모든 테이블에 RLS Enable.
-- 정책은 따로 안 만듦 → anon/authenticated 로는 모든 작업 거부됨.
-- 서버 API route 는 SUPABASE_SERVICE_ROLE_KEY 로 접근하므로 RLS 우회 → 그대로 동작.
--
-- 효과: anon key 가 외부에 노출돼도 데이터 빼낼 수 없음.
-- 서버 API route 만이 데이터에 접근 가능 (앱 자체 비밀번호 통과한 요청만).

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'RLS enable 실패: % (%)' , r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- 확인용:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
-- 모든 row 의 rowsecurity 가 true 여야 함.
