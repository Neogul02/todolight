import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * `Authorization: Bearer <access_token>`을 검증하기 위한 전용 클라이언트.
 *
 * **왜 `lib/supabase-server.ts`를 쓰지 않나**: 그쪽은 `cookies()`로 세션을 읽는 클라이언트다.
 * Bearer 요청에는 쿠키가 아예 없고, 토큰은 인자로 직접 넘긴다 — 쿠키 저장소를 끌고 올 이유가
 * 없다. 세션을 저장하지도 갱신하지도 않는다(`persistSession: false`).
 *
 * **검증은 네트워크를 타지 않는다.** 이 프로젝트의 JWT는 ES256 비대칭 키로 서명되고
 * `/auth/v1/.well-known/jwks.json`에 공개 키가 떠 있어서, `getClaims(jwt)`가 서명을
 * 로컬에서 확인한다. `auth.getUser(jwt)`를 쓰면 **요청마다** Supabase Auth로 왕복이 붙는데,
 * 위젯 타임라인 갱신처럼 짧게 여러 번 부르는 경로에서 그게 그대로 지연이 된다.
 *
 * 지연 생성인 이유는 `getSupabaseAdmin()`과 같다 — 최상위에서 만들면 환경 변수 없는
 * 빌드 단계에서 터진다.
 */
let cached: SupabaseClient | null = null;

export function getBearerVerifier(): SupabaseClient {
  if (!cached) {
    cached = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return cached;
}
