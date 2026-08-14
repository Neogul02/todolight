import { createBrowserClient } from '@supabase/ssr';

// 싱글턴 캐싱은 하지 않는다 — 한 호출이 락 경합으로 멈추면 로그아웃까지 함께 멈추는 문제가 있다.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
