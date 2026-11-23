'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import type { ApiResponse } from '@/types/api';

// APNs 기기 토큰은 16진수 64자(앞으로 길어질 수 있어 상한만 넉넉히)
const tokenSchema = z.string().regex(/^[0-9a-fA-F]{32,200}$/);

/**
 * 이 기기로 푸시를 받는다. 같은 토큰이 다른 계정에 묶여 있으면(로그아웃 → 다른 계정 로그인)
 * 주인을 지금 사람으로 갈아 끼운다 — 그래야 앞 사람 알림이 이 폰으로 오지 않는다.
 */
export async function registerPushDevice(token: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const parsed = tokenSchema.parse(token).toLowerCase();
    const { error } = await getSupabaseAdmin()
      .from('push_devices')
      .upsert({
        token: parsed,
        user_id: user.id,
        platform: 'ios',
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return null;
  });
}

/** 로그아웃할 때 — 다음 사람이 이 폰으로 내 알림을 받지 않게 */
export async function unregisterPushDevice(token: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const parsed = tokenSchema.parse(token).toLowerCase();
    const { error } = await getSupabaseAdmin()
      .from('push_devices')
      .delete()
      .eq('token', parsed)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
    return null;
  });
}
