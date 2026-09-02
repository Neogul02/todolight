import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabase-browser';

let client: SupabaseClient | null = null;
let auth: SupabaseClient | null = null;

/** 세션을 읽기 위한 인증 클라이언트. 쿠키의 세션을 들고 있는 건 @supabase/ssr 쪽이다. */
function getAuthClient(): SupabaseClient {
  if (!auth) auth = createSupabaseBrowserClient();
  return auth;
}

/**
 * 실시간 채널 전용 싱글턴.
 * 채널은 클라이언트 인스턴스에 붙기 때문에, 컴포넌트마다 새 클라이언트를 만들면
 * 웹소켓 연결이 중복으로 열린다 — 여기서 하나만 유지한다.
 *
 * **웹소켓은 쿠키로 인증되지 않는다.** HTTP 요청은 브라우저가 세션 쿠키를 자동으로 붙이지만
 * 웹소켓은 별개 연결이라 JWT를 명시로 넘겨야 한다. 예전에는 publishable 키만 들고 붙어서
 * 서버 입장에서 이 연결이 늘 익명(anon)이었고, `todos`의 RLS(`is_org_member(org_id)`)를
 * 통과하지 못해 아무 행도 오지 않았다 — 실시간 동기화가 사실상 죽어 있고
 * `useOrgBoard`의 staleTime 30초 + 포커스 재조회가 그걸 가려 왔다.
 *
 * `accessToken` 콜백을 주면 realtime-js가 **하트비트마다 토큰을 다시 물어본다.**
 * 로그인·토큰 갱신 시점을 따로 붙잡아 `setAuth()`를 다시 부르는 방식은 한 번이라도
 * 놓치면(예: 1시간 뒤 갱신) 그때부터 조용해지는데, 콜백 방식은 그 실패 모드가 없다.
 */
export function getRealtimeClient(): SupabaseClient {
  if (!client) {
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey, {
      realtime: { params: { eventsPerSecond: 10 } },
      // 이 클라이언트는 채널 전용이다. 세션을 저장·복원하게 두면 로그인을 담당하는
      // @supabase/ssr 클라이언트와 같은 저장소를 두고 다툰다.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      accessToken: async () => {
        const { data } = await getAuthClient().auth.getSession();
        // 로그아웃 상태에서는 publishable 키로 떨어진다(= 익명). 빈 문자열을 주면
        // 서버가 잘못된 토큰으로 보고 채널을 끊는다.
        return data.session?.access_token ?? publishableKey;
      },
    });
  }
  return client;
}
