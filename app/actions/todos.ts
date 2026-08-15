'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord, truncate } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import { assertMember, assertMembers } from '@/lib/guards';
import { formatRelativeDay } from '@/lib/utils';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { Todo, TodoNote, TodoStatus } from '@/types/db';

const titleSchema = (t: ActionT) => z.string().trim().min(1, t('todoTitleRequired')).max(500);
const noteSchema = (t: ActionT) => z.string().trim().min(1, t('noteRequired')).max(1000);
const statusSchema = z.enum(['todo', 'doing', 'done']);
/** 클라이언트가 정한 행 id — 아무 문자열이나 PK로 들어가지 않게 형식만 본다 */
const idSchema = (t: ActionT) => z.string().uuid(t('invalidId'));
const dueSchema = (t: ActionT) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, t('invalidDateFormat'))
    .nullable()
    .optional();

/** todo id로 조직을 되짚어 멤버 여부를 확인하고 해당 todo를 돌려준다. */
async function loadTodoForMember(todoId: string, userId: string): Promise<Todo> {
  const t = await getActionT();
  const { data, error } = await getSupabaseAdmin()
    .from('todos')
    .select('*')
    .eq('id', todoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(t('todoNotFound'));
  await assertMember(data.org_id, userId);
  return data as Todo;
}

const TODO_COLUMNS =
  'id, org_id, owner_id, title, status, due_date, position, created_by, handled_by, completed_at, created_at, updated_at, deleted_at';

/** 알림 문구에 쓸 이름들과 조직 웹훅을 한 번에 읽는다 */
async function loadNotifyContext(orgId: string, userIds: string[]) {
  const db = getSupabaseAdmin();
  const [{ data: org }, { data: profiles }] = await Promise.all([
    db.from('organizations').select('name, discord_webhook_url').eq('id', orgId).maybeSingle(),
    db.from('profiles').select('id, display_name').in('id', [...new Set(userIds)]),
  ]);
  const nameOf = (id: string) =>
    profiles?.find(p => p.id === id)?.display_name ?? '알 수 없음';
  return { orgName: org?.name ?? '조직', webhook: org?.discord_webhook_url ?? null, nameOf };
}

/** 조직 전체의 할 일 + 메모를 한 번에 — 보드가 이걸로 모든 컬럼을 그린다 */
export async function fetchOrgTodos(orgId: string): Promise<ApiResponse<Todo[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    await assertMember(orgId, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .select(TODO_COLUMNS)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const todos = (data ?? []) as Todo[];
    if (todos.length === 0) return [];

    const { data: notes, error: noteError } = await getSupabaseAdmin()
      .from('todo_notes')
      .select('id, todo_id, author_id, content, created_at, profiles!inner (display_name, avatar_color, avatar_url)')
      .in('todo_id', todos.map(t => t.id))
      .order('created_at', { ascending: true });
    if (noteError) throw new Error(noteError.message);

    const byTodo = new Map<string, TodoNote[]>();
    ((notes ?? []) as unknown as (TodoNote & {
      profiles: { display_name: string; avatar_color: string | null; avatar_url: string | null };
    })[]).forEach(n => {
      const list = byTodo.get(n.todo_id) ?? [];
      list.push({
        id: n.id,
        todo_id: n.todo_id,
        author_id: n.author_id,
        content: n.content,
        created_at: n.created_at,
        author_name: n.profiles?.display_name,
        author_color: n.profiles?.avatar_color ?? null,
        author_avatar_url: n.profiles?.avatar_url ?? null,
      });
      byTodo.set(n.todo_id, list);
    });

    const { data: participants, error: participantError } = await getSupabaseAdmin()
      .from('todo_participants')
      .select('todo_id, user_id')
      .in('todo_id', todos.map(t => t.id));
    if (participantError) throw new Error(participantError.message);

    const participantsByTodo = new Map<string, string[]>();
    (participants ?? []).forEach(p => {
      const list = participantsByTodo.get(p.todo_id) ?? [];
      list.push(p.user_id);
      participantsByTodo.set(p.todo_id, list);
    });

    return todos.map(t => ({
      ...t,
      notes: byTodo.get(t.id) ?? [],
      participant_ids: participantsByTodo.get(t.id) ?? [],
    }));
  });
}

/**
 * 할 일 추가.
 * ownerId를 넘기면 남의 컬럼에도 꽂아 넣을 수 있다 — "이거 좀 해줘" 케이스.
 */
export async function createTodo(input: {
  orgId: string;
  title: string;
  ownerId?: string;
  dueDate?: string | null;
  /**
   * 클라이언트가 미리 정한 행 id. 낙관적으로 그린 카드와 **같은 id**로 저장해야
   * 뒤이어 도착하는 실시간 INSERT가 같은 행으로 인식돼 카드가 둘로 늘지 않는다.
   * 넘기지 않으면 DB의 기본값(gen_random_uuid)이 쓰인다.
   */
  id?: string;
}): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const title = titleSchema(t).parse(input.title);
    const dueDate = dueSchema(t).parse(input.dueDate ?? null) ?? null;
    const ownerId = input.ownerId ?? user.id;
    const id = input.id ? idSchema(t).parse(input.id) : undefined;

    /*
      소속 확인과 맨 위 position 조회는 서로를 기다릴 이유가 없다 —
      직렬로 두면 왕복 하나가 통째로 응답 시간에 얹힌다.
      남의 목록에 꽂는 경우 주인도 같은 조직인지 함께 본다(멤버 조회 한 번으로).
    */
    const [, top] = await Promise.all([
      assertMembers(input.orgId, ownerId === user.id ? [user.id] : [user.id, ownerId]),
      // 같은 컬럼 맨 위로 — position은 double이라 앞에 넣을 때 재정렬이 필요 없다.
      getSupabaseAdmin()
        .from('todos')
        .select('position')
        .eq('org_id', input.orgId)
        .eq('owner_id', ownerId)
        .is('deleted_at', null)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
        .then(r => r.data),
    ]);

    const position = top ? top.position - 1 : 0;

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .insert({
        ...(id ? { id } : {}),
        org_id: input.orgId,
        owner_id: ownerId,
        title,
        due_date: dueDate,
        position,
        created_by: user.id,
      })
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    // 알림은 응답 뒤에 보낸다 — 웹훅이 느려도 추가 자체는 즉시 끝나야 한다
    after(async () => {
      const { orgName, webhook, nameOf } = await loadNotifyContext(input.orgId, [user.id, ownerId]);
      const actor = nameOf(user.id);
      const owner = nameOf(ownerId);
      await notifyDiscord(
        webhook,
        '새 할 일',
        ownerId === user.id
          ? `**${actor}**님이 할 일을 추가했어요.`
          : `**${actor}**님이 **${owner}**님 목록에 할 일을 추가했어요.`,
        [
          { name: '내용', value: truncate(title) },
          { name: '담당', value: owner, inline: true },
          { name: '마감', value: dueDate ? formatRelativeDay(dueDate) : '없음', inline: true },
          { name: '조직', value: orgName, inline: true },
        ],
        { url: `${process.env.NEXT_PUBLIC_SITE_URL}/board`, authorName: orgName }
      );
    });

    return { ...(data as Todo), notes: [] };
  });
}

/** 상태 변경 — 남의 할 일을 대신 완료 처리하면 handled_by에 내가 남는다 */
export async function setTodoStatus(
  todoId: string,
  status: TodoStatus
): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    const next = statusSchema.parse(status);

    const patch: Record<string, unknown> = { status: next };
    if (next === 'done') {
      patch.completed_at = new Date().toISOString();
      patch.handled_by = user.id;
    } else {
      patch.completed_at = null;
      patch.handled_by = null;
    }

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .update(patch)
      .eq('id', todo.id)
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as Todo;
  });
}

/** 제목 · 마감일 · 담당자 수정 */
export async function updateTodo(
  todoId: string,
  patch: { title?: string; dueDate?: string | null; ownerId?: string }
): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = titleSchema(t).parse(patch.title);
    if (patch.dueDate !== undefined) update.due_date = dueSchema(t).parse(patch.dueDate) ?? null;
    if (patch.ownerId !== undefined && patch.ownerId !== todo.owner_id) {
      await assertMember(todo.org_id, patch.ownerId);
      update.owner_id = patch.ownerId;
    }
    if (Object.keys(update).length === 0) return todo;

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .update(update)
      .eq('id', todo.id)
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as Todo;
  });
}

/** 지우거나 되살릴 수 있는 사람: 할 일의 주인 · 그 할 일을 만든 사람 · 방장/관리자 */
async function assertCanRemove(todo: Todo, userId: string): Promise<void> {
  if (todo.owner_id === userId || todo.created_by === userId) return;

  const { data: me } = await getSupabaseAdmin()
    .from('org_members')
    .select('role')
    .eq('org_id', todo.org_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
    const t = await getActionT();
    throw new Error(t('cannotDeleteTodo'));
  }
}

/**
 * 삭제 — 실제로 지우지 않고 deleted_at만 찍는다(소프트 삭제).
 * 카드 오른쪽 X는 확인 절차 없이 바로 눌리므로, 잘못 눌러도 되살릴 수 있어야 한다.
 */
export async function deleteTodo(todoId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    await assertCanRemove(todo, user.id);

    const { error } = await getSupabaseAdmin()
      .from('todos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', todo.id);
    if (error) throw new Error(error.message);
    return null;
  });
}

/**
 * 삭제 취소. 지운 직후 토스트의 "실행취소"가 부른다.
 * 이미 지워진 행을 다뤄야 해서 loadTodoForMember(살아 있는 행만 조회)를 쓸 수 없다.
 */
export async function restoreTodo(todoId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .select('*')
      .eq('id', todoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(t('todoNotFound'));

    const todo = data as Todo;
    await assertMember(todo.org_id, user.id);
    await assertCanRemove(todo, user.id);

    const { error: restoreError } = await getSupabaseAdmin()
      .from('todos')
      .update({ deleted_at: null })
      .eq('id', todo.id);
    if (restoreError) throw new Error(restoreError.message);
    return null;
  });
}

/** 메모 추가 — "내가 대신 처리했음" 같은 한 줄을 남기는 용도 */
export async function addTodoNote(todoId: string, content: string): Promise<ApiResponse<TodoNote>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();
    const parsed = noteSchema(t).parse(content);

    const { data, error } = await getSupabaseAdmin()
      .from('todo_notes')
      .insert({ todo_id: todo.id, author_id: user.id, content: parsed })
      .select('id, todo_id, author_id, content, created_at')
      .single();
    if (error) throw new Error(error.message);

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('display_name, avatar_color, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    return {
      ...(data as TodoNote),
      author_name: profile?.display_name,
      author_color: profile?.avatar_color ?? null,
      author_avatar_url: profile?.avatar_url ?? null,
    };
  });
}

/** 메모 수정 — 작성자 본인만. 작성자·아바타는 안 바뀌므로 낙관적 반영이 가능하다 */
export async function updateTodoNote(noteId: string, content: string): Promise<ApiResponse<TodoNote>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const parsed = noteSchema(t).parse(content);

    const { data: note } = await getSupabaseAdmin()
      .from('todo_notes')
      .select('id, author_id')
      .eq('id', noteId)
      .maybeSingle();
    if (!note) throw new Error(t('noteNotFound'));
    if (note.author_id !== user.id) throw new Error(t('cannotEditNote'));

    const { data, error } = await getSupabaseAdmin()
      .from('todo_notes')
      .update({ content: parsed })
      .eq('id', noteId)
      .select('id, todo_id, author_id, content, created_at')
      .single();
    if (error) throw new Error(error.message);
    return data as TodoNote;
  });
}

/** 대신 처리 — 완료 표시 + 메모를 한 번에 (보드의 "대신 처리" 버튼) */
export async function handleForMember(
  todoId: string,
  note: string
): Promise<ApiResponse<{ todo: Todo; note: TodoNote }>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();
    const parsedNote = noteSchema(t).parse(note);

    const { data: updated, error } = await getSupabaseAdmin()
      .from('todos')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
        handled_by: user.id,
      })
      .eq('id', todo.id)
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);

    const { data: noteRow, error: noteError } = await getSupabaseAdmin()
      .from('todo_notes')
      .insert({ todo_id: todo.id, author_id: user.id, content: parsedNote })
      .select('id, todo_id, author_id, content, created_at')
      .single();
    if (noteError) throw new Error(noteError.message);

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('display_name, avatar_color, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    after(async () => {
      const { orgName, webhook, nameOf } = await loadNotifyContext(todo.org_id, [
        user.id,
        todo.owner_id,
      ]);
      await notifyDiscord(
        webhook,
        '대신 처리',
        `**${nameOf(user.id)}**님이 **${nameOf(todo.owner_id)}**님의 할 일을 대신 처리했어요.`,
        [
          { name: '내용', value: truncate(todo.title) },
          { name: '메모', value: truncate(parsedNote, 900) },
          { name: '마감', value: todo.due_date ? formatRelativeDay(todo.due_date) : '없음', inline: true },
          { name: '조직', value: orgName, inline: true },
        ],
        { url: `${process.env.NEXT_PUBLIC_SITE_URL}/board`, authorName: orgName }
      );
    });

    return {
      todo: updated as Todo,
      note: {
        ...(noteRow as TodoNote),
        author_name: profile?.display_name,
        author_color: profile?.avatar_color ?? null,
        author_avatar_url: profile?.avatar_url ?? null,
      },
    };
  });
}

export async function deleteTodoNote(noteId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();
    const { data: note } = await getSupabaseAdmin()
      .from('todo_notes')
      .select('id, author_id')
      .eq('id', noteId)
      .maybeSingle();
    if (!note) throw new Error(t('noteNotFound'));
    if (note.author_id !== user.id) throw new Error(t('cannotDeleteNote'));

    const { error } = await getSupabaseAdmin().from('todo_notes').delete().eq('id', noteId);
    if (error) throw new Error(error.message);
    return null;
  });
}
