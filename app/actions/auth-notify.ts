'use server';

import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import type { ApiResponse } from '@/types/api';

/** 방금(60초 이내) 가입한 이메일인지 확인 — 인증 없는 공개 액션이라 스팸 호출을 막는 용도 */
async function isRecentSignup(email: string): Promise<boolean> {
  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const { data } = await getSupabaseAdmin()
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .gte('created_at', sixtySecondsAgo)
    .maybeSingle();
  return !!data;
}

/**
 * 회원가입 알림 — 가입 직후엔 세션이 없을 수 있어 requireAuth()를 쓰지 않는다.
 * 대신 해당 이메일의 profiles row가 방금 생겼는지 확인한 뒤에만 알림을 보낸다.
 */
export async function notifySignedUp(email: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const trimmed = email.trim();
    if (!trimmed || !(await isRecentSignup(trimmed))) return null;

    after(() =>
      notifyDiscord(null, '새 가입', `**${trimmed}**님이 가입했어요.`, [
        { name: '이메일', value: trimmed },
      ])
    );
    return null;
  });
}

/** 로그인 알림 — requireAuth()로 실제 세션을 검증하므로 위조 불가 */
export async function notifyLoggedIn(): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    const name = profile?.display_name ?? user.email ?? '알 수 없음';

    after(() => notifyDiscord(null, '로그인', `**${name}**님이 로그인했어요.`));
    return null;
  });
}
