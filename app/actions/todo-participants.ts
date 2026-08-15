'use server';

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import { assertMember } from '@/lib/guards';
import { getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';

/** todo id로 조직·주인을 되짚는다. join/leave 둘 다 필요해서 공용으로 뺐다 */
async function loadTodoOrgAndOwner(
  todoId: string
): Promise<{ orgId: string; ownerId: string }> {
  const t = await getActionT();
  const { data, error } = await getSupabaseAdmin()
    .from('todos')
    .select('org_id, owner_id')
    .eq('id', todoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(t('todoNotFound'));
  return { orgId: data.org_id, ownerId: data.owner_id };
}

/** 같이하기 — 남의 할 일을 내 컬럼에도 띄운다. 완료 상태는 원본 그대로 공유한다 */
export async function joinTodo(todoId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const { orgId, ownerId } = await loadTodoOrgAndOwner(todoId);
    await assertMember(orgId, user.id);
    if (ownerId === user.id) throw new Error(t('cannotJoinOwnTodo'));

    const { error } = await getSupabaseAdmin()
      .from('todo_participants')
      .insert({ todo_id: todoId, org_id: orgId, user_id: user.id });
    if (error) {
      if (error.code === '23505') throw new Error(t('alreadyJoined'));
      throw new Error(error.message);
    }
    return null;
  });
}

/** 그만하기 — 본인 참여만 뗀다. 원본 할 일·다른 참여자에는 영향 없다 */
export async function leaveTodo(todoId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const { error } = await getSupabaseAdmin()
      .from('todo_participants')
      .delete()
      .eq('todo_id', todoId)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
    return null;
  });
}
