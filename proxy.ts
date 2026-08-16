import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16은 middleware.ts 대신 proxy.ts를 쓴다 — middleware.ts를 만들면 충돌 에러가 난다.
const PROTECTED_PREFIXES = ['/board', '/calendar', '/ledger', '/team', '/me', '/orgs'];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims()는 JWT를 로컬 검증한다 — getUser()의 매 요청 Auth 서버 왕복을 없앤다.
  const { data } = await supabase.auth.getClaims();

  const isProtected = PROTECTED_PREFIXES.some(p => request.nextUrl.pathname.startsWith(p));
  if (isProtected && !data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

// 보호 라우트를 추가하면 PROTECTED_PREFIXES와 이 matcher 양쪽에 등록할 것.
export const config = {
  matcher: [
    '/board/:path*',
    '/calendar/:path*',
    '/ledger/:path*',
    '/team/:path*',
    '/me/:path*',
    '/orgs/:path*',
  ],
};
