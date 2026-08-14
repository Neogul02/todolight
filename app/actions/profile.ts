'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import { isValidTheme } from '@/lib/themes';
import type { ApiResponse } from '@/types/api';
import type { Profile } from '@/types/db';

const nameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(30);

export async function fetchMyProfile(): Promise<ApiResponse<Profile>> {
  return wrap(async () => {
    const user = await requireAuth();
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select('id, email, display_name, avatar_color, theme, created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('프로필을 찾을 수 없습니다.');
    return data as Profile;
  });
}

export async function updateMyProfile(patch: {
  displayName?: string;
  avatarColor?: string | null;
  theme?: string;
}): Promise<ApiResponse<Profile>> {
  return wrap(async () => {
    const user = await requireAuth();

    const update: Record<string, unknown> = {};
    if (patch.displayName !== undefined) update.display_name = nameSchema.parse(patch.displayName);
    if (patch.avatarColor !== undefined)
      update.avatar_color = patch.avatarColor ? patch.avatarColor.slice(0, 8) : null;
    if (patch.theme !== undefined) {
      if (!isValidTheme(patch.theme)) throw new Error('존재하지 않는 테마입니다.');
      update.theme = patch.theme;
    }
    if (Object.keys(update).length === 0) throw new Error('변경할 내용이 없습니다.');

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id, email, display_name, avatar_color, theme, created_at')
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return data as Profile;
  });
}
