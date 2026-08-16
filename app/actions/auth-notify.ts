'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import type { ApiResponse } from '@/types/api';

const emailSchema = z.string().trim().toLowerCase().email();

/** 방금(60초 이내) 가입한 이메일인지 확인 — 인증 없는 공개 액션이라 스팸 호출을 막는 용도 */
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

/**
 * 회원가입 알림 — 가입 직후엔 세션이 없을 수 있어 requireAuth()를 쓰지 않는다.
 * 대신 해당 이메일의 profiles row가 방금 생겼는지 확인한 뒤에만 알림을 보낸다.
 *
 * email은 인증 없는 공개 입력이라 반드시 실제 이메일 형식으로 검증하고 정확히 일치
 * (.eq())시킨다 — ilike는 '%'·'_' 같은 와일드카드를 그대로 패턴으로 써서, 공격자가
 * 임의 문자열을 넣고 마침 다른 사람이 60초 안에 가입하면 그 문자열이 "새 가입" 알림에
 * 실제 이메일인 것처럼 찍혀 나간다.
 */
export async function notifySignedUp(email: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success || !(await isRecentSignup(parsed.data))) return null;
    const trimmed = parsed.data;

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
