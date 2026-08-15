'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import { isValidTheme } from '@/lib/themes';
import { isValidLocale } from '@/lib/locales';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { Profile } from '@/types/db';

const nameSchema = (t: ActionT) => z.string().trim().min(1, t('nameRequired')).max(30);

const PROFILE_COLUMNS =
  'id, email, display_name, avatar_color, avatar_url, theme, locale, show_done, show_ledger, created_at';

export async function fetchMyProfile(): Promise<ApiResponse<Profile>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(t('profileNotFound'));
    return data as Profile;
  });
}

export async function updateMyProfile(patch: {
  displayName?: string;
  avatarUrl?: string | null;
  theme?: string;
  locale?: string;
  showDone?: boolean;
  showLedger?: boolean;
}): Promise<ApiResponse<Profile>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const update: Record<string, unknown> = {};
    if (patch.displayName !== undefined) update.display_name = nameSchema(t).parse(patch.displayName);
    if (patch.avatarUrl !== undefined) update.avatar_url = patch.avatarUrl || null;
    if (patch.showDone !== undefined) update.show_done = patch.showDone;
    if (patch.showLedger !== undefined) update.show_ledger = patch.showLedger;
    if (patch.theme !== undefined) {
      if (!isValidTheme(patch.theme)) throw new Error(t('invalidTheme'));
      update.theme = patch.theme;
    }
    if (patch.locale !== undefined) {
      if (!isValidLocale(patch.locale)) throw new Error(t('invalidLocale'));
      update.locale = patch.locale;
    }
    if (Object.keys(update).length === 0) throw new Error(t('nothingToUpdate'));

    const { data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select(PROFILE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return data as Profile;
  });
}
