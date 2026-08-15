import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getActionT } from '@/lib/server-i18n';
import type { MemberRole } from '@/types/db';

/**
 * 호출자가 해당 조직의 멤버인지 확인하고 역할을 돌려준다. 아니면 throw.
 * orgs.ts/todos.ts/events.ts에 각각 복붙되어 있던 걸 하나로 합쳤다 —
 * 흩어져 있으면 "멤버가 아니에요" 문구를 세 곳에서 따로 번역해야 한다.
 */
export async function requireMembership(orgId: string, userId: string): Promise<MemberRole> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const t = await getActionT();
    throw new Error(t('notAMember'));
  }
  return data.role as MemberRole;
}

export async function requireManager(orgId: string, userId: string): Promise<MemberRole> {
  const role = await requireMembership(orgId, userId);
  if (role !== 'owner' && role !== 'admin') {
    const t = await getActionT();
    throw new Error(t('managerOnly'));
  }
  return role;
}

/** 역할은 필요 없고 멤버인지만 확인할 때 */
export async function assertMember(orgId: string, userId: string): Promise<void> {
  await requireMembership(orgId, userId);
}

/**
 * 여러 사람이 한 조직의 멤버인지 **한 번의 쿼리로** 확인한다.
 * "남의 목록에 할 일 꽂기"처럼 호출자와 주인을 함께 봐야 할 때 assertMember를 두 번
 * 부르면 왕복이 그대로 두 배가 된다 — 추가가 굼떠 보이던 이유 중 하나였다.
 */
export async function assertMembers(orgId: string, userIds: string[]): Promise<void> {
  const wanted = [...new Set(userIds)];
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)
    .in('user_id', wanted);
  if (error) throw new Error(error.message);
  if ((data?.length ?? 0) !== wanted.length) {
    const t = await getActionT();
    throw new Error(t('notAMember'));
  }
}
