import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord } from '@/lib/discord';
import { getAuthUser } from '@/app/actions/_base';

/*
  로그인·가입 알림.

  예전에는 서버 액션(`app/actions/auth-notify.ts`)이었는데, App Router는 서버 액션과
  네비게이션을 **같은 큐**에서 처리한다 — 액션을 fire-and-forget으로 던져도 라우터는
  그게 끝날 때까지 다음 이동을 미룬다. 시크릿 창처럼 콜드 스타트가 겹치면 로그인 직후
  화면이 몇 초 동안 안 넘어갔다.

  라우트 핸들러 + sendBeacon은 그 큐 밖이고, 페이지가 떠나도 전송이 보장된다.
  알림이 실패해도 로그인 흐름은 아무 영향을 받지 않는다(§Discord 알림 원칙 1).
*/

const bodySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('login') }),
  z.object({ type: z.literal('signup'), email: z.string().trim().toLowerCase().email() }),
]);

/** 방금(60초 이내) 가입한 이메일인지 확인 — 인증 없는 공개 경로라 스팸 호출을 막는 용도 */
async function isRecentSignup(email: string): Promise<boolean> {
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('id')
    .eq('email', email)
    .gte('created_at', sixtySecondsAgo)
    .maybeSingle();
  return !!data;
}

export async function POST(request: NextRequest) {
  // 다른 사이트에서 쏘는 걸 막는다. 브라우저는 교차 출처 POST에 Origin을 반드시 붙이므로
  // "있는데 다르면 거절"로 충분하다 — 없다고 막으면 Origin을 안 붙이는 클라이언트만 애먹는다.
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });

  try {
    if (parsed.data.type === 'signup') {
      // 가입 직후엔 세션이 없을 수 있어 인증을 요구하지 않는다. 대신 해당 이메일의
      // profiles row가 방금 생겼는지 확인한 뒤에만 보낸다.
      //
      // email은 인증 없는 공개 입력이라 반드시 이메일 형식으로 검증하고 정확히 일치(.eq())
      // 시킨다 — ilike는 '%'·'_'를 패턴으로 써서, 공격자가 임의 문자열을 넣고 마침 다른
      // 사람이 60초 안에 가입하면 그 문자열이 "새 가입" 알림에 실제 이메일인 것처럼 찍힌다.
      const { email } = parsed.data;
      if (await isRecentSignup(email)) {
        after(() =>
          notifyDiscord(null, '새 가입', `**${email}**님이 가입했어요.`, [
            { name: '이메일', value: email },
          ])
        );
      }
    } else {
      // 로그인 알림은 쿠키의 실제 세션을 검증하므로 위조할 수 없다.
      const user = await getAuthUser();
      if (user) {
        const { data: profile } = await getSupabaseAdmin()
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        const name = profile?.display_name ?? user.email ?? '알 수 없음';
        after(() => notifyDiscord(null, '로그인', `**${name}**님이 로그인했어요.`));
      }
    }
  } catch (e) {
    console.error('[auth-notify]', e);
  }

  // 알림 경로의 결과를 클라이언트에 알릴 이유가 없다. sendBeacon은 응답을 읽지도 않는다.
  return new NextResponse(null, { status: 204 });
}
