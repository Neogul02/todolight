'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import { requireManager, requireMembership } from '@/lib/guards';
import { isOwnStorageUrl } from '@/lib/storage-url';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { MemberRole, MemberSummary, OrgInvite, Organization } from '@/types/db';

const orgNameSchema = (t: ActionT) => z.string().trim().min(1, t('orgNameRequired')).max(60);
const emailSchema = (t: ActionT) => z.string().trim().toLowerCase().email(t('invalidEmail'));

/** 내가 속한 조직 목록 */
export async function fetchMyOrgs(): Promise<ApiResponse<(Organization & { role: MemberRole; member_count: number })[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    /*
      멤버 수까지 **한 번에** 읽는다.
      예전엔 조직 목록을 읽고 나서 org_members를 한 번 더 읽어 사람 수를 셌다 — 이건 앱을
      열 때 가장 먼저 도는 조회라(레이아웃이 await한다) 그 왕복이 첫 화면 대기 시간에
      그대로 얹혔다. PostgREST의 집계(`org_members(count)`)로 같은 값을 함께 받아 온다.
    */
    const { data, error } = await getSupabaseAdmin()
      .from('org_members')
      .select(
        'role, organizations!inner (id, name, owner_id, image_url, created_at, org_members (count))'
      )
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as {
      role: MemberRole;
      organizations: Organization & { org_members: { count: number }[] };
    }[];

    return rows.map(r => {
      const { org_members, ...org } = r.organizations;
      return {
        ...org,
        role: r.role,
        // 집계는 [{ count: n }] 한 줄로 온다. 내가 멤버라 최소 1이지만 방어적으로 1로 떨어뜨린다.
        member_count: org_members?.[0]?.count ?? 1,
      };
    });
  });
}

/** 조직 생성 — 만든 사람이 곧 방장(owner) */
export async function createOrg(name: string): Promise<ApiResponse<Organization>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const parsed = orgNameSchema(t).parse(name);

    const { data: org, error } = await getSupabaseAdmin()
      .from('organizations')
      .insert({ name: parsed, owner_id: user.id })
      .select('id, name, owner_id, image_url, created_at')
      .single();
    if (error) throw new Error(error.message);

    const { error: memberError } = await getSupabaseAdmin()
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' });
    if (memberError) {
      // 멤버 등록이 실패하면 아무도 접근할 수 없는 유령 조직이 남는다 — 되돌린다.
      await getSupabaseAdmin().from('organizations').delete().eq('id', org.id);
      throw new Error(memberError.message);
    }

    revalidatePath('/board');

    // 알림은 응답 뒤에 보낸다 — 웹훅이 느려도 조직 생성 자체는 즉시 끝나야 한다.
    // 가입/로그인과 마찬가지로 조직별 웹훅이 아니라 전역 웹훅으로 간다(조직이 막 생겨 아직
    // discord_webhook_url을 설정할 수 없었으므로).
    after(async () => {
      const { data: profile } = await getSupabaseAdmin()
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle();
      const creator = profile?.display_name ?? '알 수 없음';
      await notifyDiscord(
        null,
        '새 조직',
        `**${org.name}** 조직이 개설됐어요. (개설자: **${creator}**)`,
        [
          { name: '조직', value: org.name, inline: true },
          { name: '개설자', value: creator, inline: true },
        ]
      );
    });

    return org as Organization;
  });
}

/** 조직 멤버 목록 (보드 컬럼 순서의 원본) */
export async function fetchOrgMembers(orgId: string): Promise<ApiResponse<MemberSummary[]>> {
  return wrap(async () => {
    const user = await requireAuth();

    // 멤버 검사와 조회를 같이 보내되 함께 await한다 — fetchOrgTodos와 같은 패턴.
    // 멤버가 아니면 Promise.all이 그대로 거절되고 읽어 온 건 한 줄도 돌려주지 않는다.
    const [, membersRes] = await Promise.all([
      requireMembership(orgId, user.id),
      getSupabaseAdmin()
        .from('org_members')
        .select('user_id, role, joined_at, profiles!inner (display_name, avatar_color, avatar_url, email)')
        .eq('org_id', orgId)
        .order('joined_at', { ascending: true }),
    ]);
    const { data, error } = membersRes;
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as {
      user_id: string;
      role: MemberRole;
      profiles: {
        display_name: string;
        avatar_color: string | null;
        avatar_url: string | null;
        email: string | null;
      };
    }[]).map(r => ({
      user_id: r.user_id,
      role: r.role,
      display_name: r.profiles.display_name,
      avatar_color: r.profiles.avatar_color,
      avatar_url: r.profiles.avatar_url,
      email: r.profiles.email,
    }));
  });
}

/** 방장이 이메일로 팀원 초대 */
export async function inviteMember(orgId: string, email: string): Promise<ApiResponse<OrgInvite>> {
  return wrap(async () => {
    const user = await requireAuth();
    await requireManager(orgId, user.id);
    const t = await getActionT();
    const target = emailSchema(t).parse(email);

    if (target === user.email?.toLowerCase()) throw new Error(t('cannotInviteSelf'));

    // 이미 멤버인 이메일인지 확인
    const { data: existingProfile } = await getSupabaseAdmin()
      .from('profiles')
      .select('id')
      .eq('email', target)
      .maybeSingle();

    if (existingProfile) {
      const { data: already } = await getSupabaseAdmin()
        .from('org_members')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', existingProfile.id)
        .maybeSingle();
      if (already) throw new Error(t('alreadyMember'));
    }

    const { data, error } = await getSupabaseAdmin()
      .from('org_invites')
      .insert({ org_id: orgId, email: target, invited_by: user.id, status: 'pending' })
      .select('id, org_id, email, invited_by, status, created_at, responded_at')
      .single();
    if (error) {
      if (error.code === '23505') throw new Error(t('inviteAlreadySent'));
      throw new Error(error.message);
    }

    return data as OrgInvite;
  });
}

/** 조직의 대기 중 초대 목록 (방장 화면) */
export async function fetchOrgInvites(orgId: string): Promise<ApiResponse<OrgInvite[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    await requireMembership(orgId, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('org_invites')
      .select('id, org_id, email, invited_by, status, created_at, responded_at')
      .eq('org_id', orgId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as OrgInvite[];
  });
}

/** 나에게 온 초대 목록 (수락 대기) */
export async function fetchMyInvites(): Promise<ApiResponse<OrgInvite[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    if (!user.email) return [];

    const { data, error } = await getSupabaseAdmin()
      .from('org_invites')
      .select('id, org_id, email, invited_by, status, created_at, responded_at, organizations!inner (name), profiles!org_invites_invited_by_fkey (display_name)')
      .eq('email', user.email.toLowerCase())
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as (OrgInvite & {
      organizations: { name: string };
      profiles: { display_name: string } | null;
    })[]).map(r => ({
      id: r.id,
      org_id: r.org_id,
      email: r.email,
      invited_by: r.invited_by,
      status: r.status,
      created_at: r.created_at,
      responded_at: r.responded_at,
      org_name: r.organizations?.name,
      inviter_name: r.profiles?.display_name,
    }));
  });
}

/** 초대 수락 / 거절 */
export async function respondToInvite(
  inviteId: string,
  accept: boolean
): Promise<ApiResponse<{ orgId: string | null }>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    if (!user.email) throw new Error(t('noEmailForInvite'));

    const { data: invite, error } = await getSupabaseAdmin()
      .from('org_invites')
      .select('id, org_id, email, status')
      .eq('id', inviteId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error(t('inviteNotFound'));
    if (invite.status !== 'pending') throw new Error(t('inviteAlreadyHandled'));
    if (invite.email.toLowerCase() !== user.email.toLowerCase())
      throw new Error(t('inviteNotYours'));

    if (!accept) {
      await getSupabaseAdmin()
        .from('org_invites')
        .update({ status: 'declined', responded_at: new Date().toISOString() })
        .eq('id', inviteId);
      return { orgId: null };
    }

    const { error: joinError } = await getSupabaseAdmin()
      .from('org_members')
      .insert({ org_id: invite.org_id, user_id: user.id, role: 'member' });
    // 23505 = 이미 멤버 — 초대만 정리하고 정상 처리한다.
    if (joinError && joinError.code !== '23505') throw new Error(joinError.message);

    await getSupabaseAdmin()
      .from('org_invites')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', inviteId);

    revalidatePath('/board');
    return { orgId: invite.org_id };
  });
}

/** 초대 취소 (방장) */
export async function revokeInvite(inviteId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const { data: invite } = await getSupabaseAdmin()
      .from('org_invites')
      .select('org_id')
      .eq('id', inviteId)
      .maybeSingle();
    if (!invite) throw new Error(t('inviteNotFound'));
    await requireManager(invite.org_id, user.id);

    await getSupabaseAdmin()
      .from('org_invites')
      .update({ status: 'revoked', responded_at: new Date().toISOString() })
      .eq('id', inviteId);
    return null;
  });
}

/** 멤버 내보내기 / 스스로 나가기 */
export async function removeMember(orgId: string, userId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const myRole = await requireMembership(orgId, user.id);

    const isSelf = userId === user.id;
    if (!isSelf && myRole !== 'owner' && myRole !== 'admin')
      throw new Error(t('managerOnly'));

    const { data: target } = await getSupabaseAdmin()
      .from('org_members')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!target) throw new Error(t('memberNotFound'));
    if (target.role === 'owner') throw new Error(t('cannotRemoveOwner'));

    const { error } = await getSupabaseAdmin()
      .from('org_members')
      .delete()
      .eq('org_id', orgId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return null;
  });
}

/** 멤버 역할 변경 (owner 전용) */
export async function updateMemberRole(
  orgId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const myRole = await requireMembership(orgId, user.id);
    if (myRole !== 'owner') throw new Error(t('managerOnly'));
    if (userId === user.id) throw new Error(t('cannotChangeOwnRole'));

    const { error } = await getSupabaseAdmin()
      .from('org_members')
      .update({ role })
      .eq('org_id', orgId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return null;
  });
}

/** 조직 아이콘 설정 — 업로드는 클라이언트가 Storage에 직접 하고, 여기서는 URL만 붙인다 */
export async function updateOrgImage(
  orgId: string,
  imageUrl: string | null
): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    await requireManager(orgId, user.id);
    const t = await getActionT();

    if (imageUrl && !isOwnStorageUrl(imageUrl, 'org-images', `${orgId}/`)) {
      throw new Error(t('invalidOrgImageUrl'));
    }

    const { error } = await getSupabaseAdmin()
      .from('organizations')
      .update({ image_url: imageUrl || null })
      .eq('id', orgId);
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return null;
  });
}

/** 조직의 Discord 웹훅 조회 (방장 화면에서 현재 설정 확인용) */
export async function fetchOrgWebhook(orgId: string): Promise<ApiResponse<string | null>> {
  return wrap(async () => {
    const user = await requireAuth();
    await requireManager(orgId, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('organizations')
      .select('discord_webhook_url')
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.discord_webhook_url ?? null;
  });
}

/** Discord 웹훅 설정 — 빈 문자열이면 해제(서버 기본 웹훅으로 떨어진다) */
export async function updateOrgWebhook(
  orgId: string,
  webhookUrl: string
): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    await requireManager(orgId, user.id);

    const trimmed = webhookUrl.trim();
    if (trimmed && !/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(trimmed))
      throw new Error(t('invalidDiscordWebhook'));

    const { error } = await getSupabaseAdmin()
      .from('organizations')
      .update({ discord_webhook_url: trimmed || null })
      .eq('id', orgId);
    if (error) throw new Error(error.message);
    return null;
  });
}

/** 조직 이름 변경 */
export async function renameOrg(orgId: string, name: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    await requireManager(orgId, user.id);
    const parsed = orgNameSchema(t).parse(name);

    const { error } = await getSupabaseAdmin()
      .from('organizations')
      .update({ name: parsed })
      .eq('id', orgId);
    if (error) throw new Error(error.message);

    revalidatePath('/board');
    return null;
  });
}
