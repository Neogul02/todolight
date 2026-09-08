'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import { assertMembers, requireManager, requireMembership } from '@/lib/guards';
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

    /*
      조직 행과 방장 멤버 행이 **같이 생기거나 같이 안 생긴다.**

      예전에는 둘을 따로 보내고, 두 번째가 실패하면 첫 번째를 지우는 보상 로직을 손으로
      들고 있었다 — 그런데 그 보상 삭제도 실패할 수 있고(서버리스 인스턴스가 그 사이에
      끝나는 것으로 충분하다), 그러면 **아무도 접근할 수 없는 유령 조직**이 남는다.
      supabase-js에는 트랜잭션이 없으므로 두 문장을 함수 하나로 옮겼다.
      왕복도 2회에서 1회로 준다.
    */
    const { data: row, error } = await getSupabaseAdmin()
      .rpc('create_org_with_owner', { p_name: parsed, p_owner: user.id })
      .single<Organization & { discord_webhook_url: string | null }>();
    if (error) throw new Error(error.message);

    /*
      **컬럼을 골라 담는다.** RPC는 `returns public.organizations`라 행 전체를 돌려주는데,
      거기에는 `discord_webhook_url`이 들어 있다 — 그 URL을 아는 사람은 누구나 그 채널에
      글을 쓸 수 있으므로 방장·관리자만 볼 값이고, 그래서 `fetchOrgWebhook`이 따로 있다.
      새로 만든 조직에서는 늘 null이라 지금 새어 나갈 것은 없지만, 클라이언트로 가는
      모양이 `Organization`과 어긋난 채로 두면 나중에 진짜로 새어 나간다.
    */
    const org: Organization = {
      id: row.id,
      name: row.name,
      owner_id: row.owner_id,
      image_url: row.image_url,
      created_at: row.created_at,
    };

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

    return org;
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

/**
 * 보드에서 나 다음에 나올 팀원 순서를 정한다(개인 취향, 조직 전체에 영향 없음).
 * profiles.member_order는 `{ [orgId]: string[] }` 모양이라 다른 조직 값을 건드리지 않도록
 * 먼저 읽어서 머지한다.
 */
export async function updateMemberOrder(
  orgId: string,
  orderedUserIds: string[]
): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    // 호출자가 멤버인지 확인하는 것과, 넘어온 id가 전부 실제 이 조직 멤버인지(다른 조직
    // 사람 id가 섞여 fetchOrgMembers와 어긋나지 않도록) 확인하는 것은 서로 결과를 기다릴
    // 이유가 없다 — 함께 보낸다.
    await Promise.all([requireMembership(orgId, user.id), assertMembers(orgId, orderedUserIds)]);

    const db = getSupabaseAdmin();
    const { data: profile, error: readError } = await db
      .from('profiles')
      .select('member_order')
      .eq('id', user.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const current = (profile?.member_order ?? {}) as Record<string, string[]>;
    const { error } = await db
      .from('profiles')
      .update({ member_order: { ...current, [orgId]: orderedUserIds } })
      .eq('id', user.id);
    if (error) throw new Error(error.message);

    return null;
  });
}

/** 방장이 이메일로 팀원 초대 */
/**
 * 초대장에 붙는 한 가지 사실: **이 이메일로 가입한 계정이 있는가.**
 *
 * 이 앱은 초대 메일을 보내지 않는다 — `org_invites` 행만 만들고, 초대받은 사람이 앱을 열
 * 때 메뉴에 뜬다. 이미 쓰고 있는 사람이면 곧 보게 되지만, **아직 가입도 안 한 사람이면
 * 영영 모른다.** 초대한 쪽에서 따로 알려 줘야 하는데, 그걸 알려 줄 근거가 화면에 없었다.
 *
 * `inviteMember`는 "이미 멤버인가"를 보려고 `profiles`를 이미 읽고 있었다 — 같은 조회에서
 * 나오는 이 사실을 버리지 않고 화면까지 들고 간다.
 */
export type OrgInviteView = OrgInvite & { registered: boolean };

export async function inviteMember(
  orgId: string,
  email: string
): Promise<ApiResponse<OrgInviteView>> {
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

    // 위에서 이미 읽은 값이다 — 이 사실 하나가 "따로 알려 줘야 하나"를 가른다
    return { ...(data as OrgInvite), registered: !!existingProfile };
  });
}

/** 조직의 대기 중 초대 목록 (방장 화면) */
export async function fetchOrgInvites(orgId: string): Promise<ApiResponse<OrgInviteView[]>> {
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

    const invites = (data ?? []) as OrgInvite[];
    if (invites.length === 0) return [];

    /*
      가입 여부를 한 번에 확인한다. 초대장마다 조회하면 대기 중인 초대 수만큼 왕복이 는다.

      **이건 계정 존재 여부를 알려 주는 것이다.** 초대장의 이메일은 방장이 직접 적어 넣은
      주소이고 이 조회는 그 주소들에만 답하므로, 임의의 이메일을 넣어 가입 여부를 캐내는
      용도로는 쓸 수 없다.
      탈퇴한 사람의 프로필은 email이 null이라 여기 걸리지 않는다 — 계정이 없는 게 맞다.
    */
    const { data: profiles } = await getSupabaseAdmin()
      .from('profiles')
      .select('email')
      .in('email', invites.map(i => i.email));

    const registered = new Set((profiles ?? []).map(p => (p.email ?? '').toLowerCase()));
    return invites.map(i => ({ ...i, registered: registered.has(i.email.toLowerCase()) }));
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

/**
 * RPC가 던지는 예외 코드를 사람이 읽는 문구로 옮긴다.
 *
 * 검사를 SQL 안에서 하는 이유는 **원자성** 때문이다 — TS에서 "내가 방장인가"를 확인하고
 * 그 다음 문장으로 이양을 보내면, 그 사이에 다른 이양·삭제가 끼어들 수 있다.
 * `for update`로 조직 행을 잡은 채 검사하고 갱신해야 그 틈이 없어진다.
 * 대신 에러가 문자열로 올라오므로 여기서 한 번 번역해 준다.
 */
function orgRpcError(message: string, t: ActionT): Error {
  if (message.includes('NOT_OWNER')) return new Error(t('ownerOnly'));
  if (message.includes('ORG_NOT_FOUND')) return new Error(t('orgNotFound'));
  if (message.includes('NOT_A_MEMBER')) return new Error(t('notAMember'));
  if (message.includes('ALREADY_OWNER')) return new Error(t('alreadyOwner'));
  return new Error(message);
}

/**
 * 소유권 이양 — 방장만, 같은 조직의 멤버에게만.
 *
 * 물러난 방장은 **관리자로 남는다.** 팀원으로 떨어뜨리면 방금까지 조직을 운영하던 사람이
 * 초대 한 번 못 보내게 되는데, 그건 이양이 아니라 강등이다.
 *
 * 이게 있어야 조직이 방장을 잃지 않는다. 예전에는 `removeMember`가 방장 제거를 막기만 하고
 * 넘길 방법을 주지 않아서, 방장은 조직에서 나갈 수도 조직을 없앨 수도 없었다 —
 * 계정을 통째로 지우는 것 말고는 벗어날 길이 없는 막다른 길이었다.
 */
export async function transferOrgOwnership(
  orgId: string,
  newOwnerId: string
): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    // 소유자 검사는 RPC 안에서 잠금과 함께 다시 한다 — 여기 검사는 멤버가 아닌 사람에게
    // "방장만 할 수 있어요" 대신 "이 조직의 멤버가 아니에요"를 돌려주기 위한 것이다.
    await requireMembership(orgId, user.id);

    const { error } = await getSupabaseAdmin().rpc('transfer_org_ownership', {
      p_org: orgId,
      p_actor: user.id,
      p_new_owner: newOwnerId,
    });
    if (error) throw orgRpcError(error.message, t);

    revalidatePath('/board');
    return null;
  });
}

/**
 * 조직 삭제 — 방장만. 할 일·메모·일정·가계부·멤버·초대가 cascade로 함께 사라진다.
 *
 * **이 앱에서 유일하게 소프트 삭제가 아닌 지우기다.** 소프트 삭제는 "확인 없이 바로 누르되
 * 되돌릴 수 있게" 하려는 장치인데, 조직 삭제는 시트에서 조직 이름을 확인시키고 한 단계 더
 * 묻는 동작이라 실수로 눌릴 일이 없다. 반대로 남겨 두면 모든 조회에 "지워진 조직 제외"가
 * 붙고 한 번만 빠뜨려도 지운 조직이 목록에 다시 나타난다.
 */
export async function deleteOrg(orgId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    await requireMembership(orgId, user.id);

    const { error } = await getSupabaseAdmin().rpc('delete_org', {
      p_org: orgId,
      p_actor: user.id,
    });
    if (error) throw orgRpcError(error.message, t);

    revalidatePath('/board');
    return null;
  });
}
