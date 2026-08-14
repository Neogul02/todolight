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
      .select('id, email, display_name, avatar_color, avatar_url, theme, show_done, created_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('프로필을 찾을 수 없어요.');
    return data as Profile;
  });
}

export async function updateMyProfile(patch: {
  displayName?: string;
  avatarColor?: string | null;
  avatarUrl?: string | null;
  theme?: string;
  showDone?: boolean;
}): Promise<ApiResponse<Profile>> {
  return wrap(async () => {
    const user = await requireAuth();

    const update: Record<string, unknown> = {};
    if (patch.displayName !== undefined) update.display_name = nameSchema.parse(patch.displayName);
    if (patch.avatarColor !== undefined)
      update.avatar_color = patch.avatarColor ? patch.avatarColor.slice(0, 8) : null;
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl || null;
    if (patch.showDone !== undefined) update.show_done = patch.showDone;
    if (patch.theme !== undefined) {
      if (!isValidTheme(patch.theme)) throw new Error('없는 테마예요.');
      update.theme = patch.theme;
    }
    if (Object.keys(update).length === 0) throw new Error('바꿀 내용이 없어요.');

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select('id, email, display_name, avatar_color, avatar_url, theme, show_done, created_at')
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return data as Profile;
  });
}
