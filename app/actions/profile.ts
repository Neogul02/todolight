'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import { isValidTheme } from '@/lib/themes';
import { isValidLocale } from '@/lib/locales';
import { isOwnStorageUrl } from '@/lib/storage-url';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { Profile } from '@/types/db';

const nameSchema = (t: ActionT) => z.string().trim().min(1, t('nameRequired')).max(30);

const PROFILE_COLUMNS =
  'id, email, display_name, avatar_color, avatar_url, theme, locale, show_done, show_ledger, member_order, created_at';

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
    if (patch.avatarUrl !== undefined) {
      if (patch.avatarUrl && !isOwnStorageUrl(patch.avatarUrl, 'avatars', `${user.id}/`)) {
        throw new Error(t('invalidAvatarUrl'));
      }
      update.avatar_url = patch.avatarUrl || null;
    }
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

/**
 * 계정 삭제.
 *
 * App Store Review Guideline **5.1.1(v)** — 계정을 만들 수 있는 앱은 **앱 안에서** 계정을
 * 삭제할 수 있어야 한다(웹으로 링크를 보내는 것도 안 된다). iOS만의 요구가 아니라 원래
 * 있어야 했던 경로다.
 *
 * 이 앱에서 지우기는 전부 소프트 삭제지만 계정 삭제만은 되돌릴 수 없다. 다만 되돌릴 수
 * 없는 건 **그 사람의 계정**이지 **팀의 기록**이 아니다. 그래서 순서가 있다:
 *
 * 1. 내가 방장인 조직 — 남은 사람이 있으면 **소유권을 넘기고** 나간다.
 *    후계자는 관리자 중 먼저 들어온 사람, 없으면 팀원 중 먼저 들어온 사람이다.
 *    조직이 방장 없이 남으면 초대도 설정 변경도 할 수 없는 화석이 된다.
 * 2. 나 혼자인 조직은 **조직째로 지운다.** 아무와도 공유하지 않은 것이라 남길 이유가 없고,
 *    남기면 주인 없는 조직이 DB에 쌓인다(cascade로 그 조직의 할 일·일정·가계부가 함께 간다).
 * 3. 그 밖의 조직에서는 내 멤버 행만 뺀다.
 * 4. 프로필은 **묘비로 남긴다** — 이름·이메일·사진만 지운다. 남의 컬럼에 넣어 준 할 일,
 *    남이 보고 있는 카드의 메모, 조직 가계부에서 내가 낸 줄이 사라지면 안 되기 때문이다.
 *    (cascade를 왜 끊었는지는 20260908000000_account_deletion.sql에 적어 뒀다.)
 * 5. 마지막에 `auth.users`를 지운다. 로그인 수단은 진짜로 없어진다.
 *
 * **순서를 뒤집지 말 것.** auth.users를 먼저 지우면 그 뒤 단계가 실패했을 때 로그인도 못
 * 하고 조직에는 방장 없이 남는, 사람이 손으로 고쳐야만 벗어나는 상태가 된다.
 * 반대로 지금 순서에서는 중간에 실패해도 계정은 살아 있어 다시 시도할 수 있다.
 *
 * 묘비의 이름은 **지우는 사람의 언어로 한 번** 박힌다 — 남은 멤버가 다른 언어를 쓰면
 * 그 사람에게는 번역되지 않은 채 보인다. 읽을 때 갈아 끼우려면 프로필을 조인하는 모든
 * 자리를 고쳐야 하는데, 탈퇴한 사람 이름이 뜨는 곳은 메모 작성자 정도이고 나머지는
 * 이미 "알 수 없는 멤버" 폴백을 갖고 있다 — 그 값에 비해 품이 너무 크다.
 */
export async function deleteMyAccount(): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const admin = getSupabaseAdmin();

    // 1~3. 조직 정리 — 내가 속한 모든 조직을 역할과 함께 읽는다
    const { data: myMemberships, error: membershipError } = await admin
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id);
    if (membershipError) throw new Error(membershipError.message);

    for (const { org_id: orgId, role } of myMemberships ?? []) {
      if (role !== 'owner') continue;

      /*
        후계자 고르기: 관리자 → 팀원, 각 그룹 안에서는 먼저 들어온 사람.
        role로 정렬하면 'admin' < 'member'라 알파벳 순이 그대로 우선순위가 된다 —
        우연이지만 기대는 하지 않는다. 아래에서 명시로 admin을 먼저 찾는다.
      */
      const { data: others } = await admin
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', orgId)
        .neq('user_id', user.id)
        .order('joined_at', { ascending: true });

      const successor =
        others?.find(m => m.role === 'admin') ?? others?.find(m => m.role === 'member') ?? null;

      /*
        둘 다 **원자적 연산 하나**로 한다(`20260908115831_atomic_org_ops.sql`).
        여기서 손으로 두 문장을 보내면 그 사이에 죽었을 때 방장이 둘이거나 없는 조직이
        남는데, 하필 이 액션은 마지막에 계정을 지우므로 그 상태를 고칠 사람도 사라진다.
        조직 삭제·이양을 손으로 하는 곳이 `/team`과 여기 둘이라는 점도 이유다 —
        규칙이 두 벌이면 반드시 갈라진다.
      */
      if (!successor) {
        // 2. 나 혼자인 조직 — 조직째로 지운다(cascade가 할 일·일정·가계부를 함께 가져간다)
        const { error } = await admin.rpc('delete_org', { p_org: orgId, p_actor: user.id });
        if (error) throw new Error(error.message);
        continue;
      }

      // 1. 소유권 이양 — organizations.owner_id와 org_members.role을 잠금 안에서 함께 옮긴다
      const { error } = await admin.rpc('transfer_org_ownership', {
        p_org: orgId,
        p_actor: user.id,
        p_new_owner: successor.user_id,
      });
      if (error) throw new Error(error.message);
    }

    // 3. 남은 멤버 행을 전부 뺀다(위에서 지운 조직의 행은 cascade로 이미 없다)
    const { error: leaveError } = await admin
      .from('org_members')
      .delete()
      .eq('user_id', user.id);
    if (leaveError) throw new Error(leaveError.message);

    /*
      내 이메일로 와 있던 초대는 지운다 — 이메일이 남는 유일한 다른 자리다.
      status와 무관하게 전부 지운다: 거절한 초대의 기록을 남길 이유가 없고,
      남기면 "지웠는데 이메일이 DB에 있다"가 된다.
    */
    if (user.email) {
      await admin.from('org_invites').delete().ilike('email', user.email);
    }

    // 4. 프로필은 묘비로 — 사진 파일도 실제로 지운다(DB에서 URL만 지우면 파일은 남는다)
    await admin.storage.from('avatars').remove([`${user.id}/avatar.webp`]);

    const { error: tombstoneError } = await admin
      .from('profiles')
      .update({
        display_name: t('deletedUserName'),
        email: null,
        avatar_url: null,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (tombstoneError) throw new Error(tombstoneError.message);

    // 5. 로그인 수단을 지운다. 여기까지 와야 진짜 삭제다.
    const { error: authError } = await admin.auth.admin.deleteUser(user.id);
    if (authError) throw new Error(authError.message);

    return null;
  });
}
