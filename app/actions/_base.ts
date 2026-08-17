import { cache } from 'react';
import { createSupabaseServerClient } from '@/lib/supabase-server';
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
 * 요청 하나 안에서는 한 번만 확인한다.
 *
 * 앱 진입 한 번에 이게 세 번 돈다 — `(app)/layout.tsx`가 직접 부르고, 거기서 병렬로 부르는
 * `fetchMyOrgs`·`fetchMyProfile`이 각자 `requireAuth()`로 또 부른다. 매번 쿠키를 파싱하고
 * Supabase 클라이언트를 새로 만들고 JWT를 검증하는데, 같은 요청 안에서는 결과가 같다.
 * `cache()`는 요청 범위라 요청이 끝나면 비므로 세션이 오래 물리지 않는다.
 */
export const getAuthUser = cache(async function getAuthUser(): Promise<AuthUser | null> {
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
