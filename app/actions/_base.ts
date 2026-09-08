import { cache } from 'react';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getBearerVerifier } from '@/lib/supabase-bearer';
import { getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String((error as { message: unknown }).message);
  return String(error);
}

// redirect()/notFound()/동적 API 감지는 throw로 구현된 Next.js 내부 제어 흐름이다 —
// digest로 식별해 애플리케이션 오류로 오인하지 않고 그대로 다시 던진다.
export function isNextInternalControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'DYNAMIC_SERVER_USAGE' ||
    digest.startsWith('NEXT_REDIRECT') ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
  );
}

export async function wrap<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (e) {
    if (isNextInternalControlFlowError(e)) throw e;
    console.error('[action]', e);
    return { success: false, error: extractErrorMessage(e) };
  }
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * 지금 요청이 누구인지 — **웹 쿠키와 iOS Bearer 토큰 두 경로를 다 본다.**
 *
 * 웹 서버 액션은 `@supabase/ssr` 쿠키로 세션을 읽는다. 네이티브 앱에는 쿠키가 없고
 * `Authorization: Bearer <access_token>`을 보낸다. **이 함수 하나가 두 경로를 다 보면
 * 서버 액션 41개가 전부 그대로 앱에서도 동작한다** — 가드도, zod 검증도, Discord 알림도,
 * `position` 계산도 다시 만들 필요가 없다. `/api/v1` 어댑터는 그 위에 얇게 얹힌다.
 *
 * **Bearer가 쿠키보다 먼저다.** 웹 요청에는 Authorization 헤더가 실릴 일이 없으므로 웹
 * 동작은 한 글자도 바뀌지 않고, 앱 요청에는 쿠키가 없으므로 서로 섞일 일이 없다.
 * 헤더는 브라우저가 교차 출처로 마음대로 붙일 수 없어서(쿠키와 달리 자동으로 실리지도
 * 않는다) 이 경로가 CSRF 표면을 넓히지도 않는다.
 *
 * 요청 하나 안에서는 한 번만 확인한다. 앱 진입 한 번에 이게 세 번 돈다 —
 * `(app)/layout.tsx`가 직접 부르고, 거기서 병렬로 부르는 `fetchMyOrgs`·`fetchMyProfile`이
 * 각자 `requireAuth()`로 또 부른다. 매번 쿠키를 파싱하고 클라이언트를 만들고 JWT를
 * 검증하는데 같은 요청 안에서는 결과가 같다. `cache()`는 요청 범위라 세션이 오래 물리지 않는다.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
  const authorization = (await headers()).get('authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (bearer) {
    /*
      `getUser(jwt)`가 아니라 `getClaims(jwt)`다. 전자는 요청마다 Supabase Auth로 왕복이
      붙는다 — 잠금화면 위젯 갱신처럼 짧게 여러 번 부르는 경로에서 그게 그대로 지연이 된다.
      이 프로젝트의 JWT는 ES256 비대칭 키라 JWKS로 서명을 로컬 확인한다.
      서명·만료가 어긋나면 error가 오므로 그대로 미인증으로 떨어뜨린다.
    */
    const { data, error } = await getBearerVerifier().auth.getClaims(bearer);
    if (error || !data?.claims?.sub) return null;
    const claims = data.claims;
    return { id: claims.sub as string, email: (claims.email as string | undefined) ?? null };
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub as string, email: (claims.email as string | undefined) ?? null };
});

/**
 * 로그인이 필요한 액션의 첫 줄에서 호출.
 * 서버 액션은 공개 POST 엔드포인트라 proxy.ts의 페이지 보호가 적용되지 않는다 —
 * 모든 액션이 여기서 직접 인증을 확인해야 한다.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    const t = await getActionT();
    throw new Error(t('unauthorized'));
  }
  return user;
}
