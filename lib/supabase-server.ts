import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** 서버 컴포넌트 / 서버 액션에서 인증 확인용 (ANON KEY, RLS 적용) */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서는 쿠키 쓰기가 막혀 있다 — proxy.ts가 세션 갱신을 담당한다.
          }
        },
      },
    }
  );
}
