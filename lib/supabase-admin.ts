import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * RLS를 우회하는 서버 전용 클라이언트.
 * 서버 액션에서만 쓸 것 — 권한 검사는 호출하는 액션이 직접 책임진다.
 *
 * 모듈 로드 시점이 아니라 첫 호출 때 만든다. 빌드 단계에서 환경 변수 없이
 * 모듈만 평가되는 경우가 있는데, 최상위에서 만들면 거기서 바로 터진다.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
