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
