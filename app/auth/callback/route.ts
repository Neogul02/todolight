import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * Supabase 메일 링크(비밀번호 재설정·이메일 확인)가 돌아오는 자리.
 * PKCE 코드를 세션으로 교환해 쿠키에 심어야 proxy.ts와 서버 액션이 로그인 상태를 알아본다.
 * 교환은 반드시 서버에서 — 검증자(code verifier)가 쿠키에 있다.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  // 열린 리다이렉트를 막으려고 앱 내부 경로만 받는다
  const raw = searchParams.get('next') ?? '/board';
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/board';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=expired_link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
