'use server';

import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, wrap } from './_base';
import type { ApiResponse } from '@/types/api';
import type { Todo, TodoNote, TodoStatus } from '@/types/db';

const titleSchema = z.string().trim().min(1, '할 일 내용을 입력해 주세요.').max(500);
const noteSchema = z.string().trim().min(1, '메모를 입력해 주세요.').max(1000);
const statusSchema = z.enum(['todo', 'doing', 'done']);
const dueSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '날짜 형식이 올바르지 않습니다.')
  .nullable()
  .optional();

async function assertMember(orgId: string, userId: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('해당 조직의 멤버가 아닙니다.');
}

/** todo id로 조직을 되짚어 멤버 여부를 확인하고 해당 todo를 돌려준다. */
async function loadTodoForMember(todoId: string, userId: string): Promise<Todo> {
  const { data, error } = await getSupabaseAdmin()
    .from('todos')
    .select('*')
    .eq('id', todoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('할 일을 찾을 수 없습니다.');
  await assertMember(data.org_id, userId);
  return data as Todo;
}

const TODO_COLUMNS =
  'id, org_id, owner_id, title, status, due_date, position, created_by, handled_by, completed_at, created_at, updated_at';

/** 조직 전체의 할 일 + 메모를 한 번에 — 보드가 이걸로 모든 컬럼을 그린다 */
export async function fetchOrgTodos(orgId: string): Promise<ApiResponse<Todo[]>> {
  return wrap(async () => {
    const user = await requireAuth();
    await assertMember(orgId, user.id);

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .select(TODO_COLUMNS)
      .eq('org_id', orgId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);

    const todos = (data ?? []) as Todo[];
    if (todos.length === 0) return [];

    const { data: notes, error: noteError } = await getSupabaseAdmin()
      .from('todo_notes')
      .select('id, todo_id, author_id, content, created_at, profiles!inner (display_name, avatar_emoji)')
      .in('todo_id', todos.map(t => t.id))
      .order('created_at', { ascending: true });
    if (noteError) throw new Error(noteError.message);

    const byTodo = new Map<string, TodoNote[]>();
    ((notes ?? []) as unknown as (TodoNote & {
      profiles: { display_name: string; avatar_emoji: string | null };
    })[]).forEach(n => {
      const list = byTodo.get(n.todo_id) ?? [];
      list.push({
        id: n.id,
        todo_id: n.todo_id,
        author_id: n.author_id,
        content: n.content,
        created_at: n.created_at,
        author_name: n.profiles?.display_name,
        author_emoji: n.profiles?.avatar_emoji ?? null,
      });
      byTodo.set(n.todo_id, list);
    });

    return todos.map(t => ({ ...t, notes: byTodo.get(t.id) ?? [] }));
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
}): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    await assertMember(input.orgId, user.id);

    const title = titleSchema.parse(input.title);
    const dueDate = dueSchema.parse(input.dueDate ?? null) ?? null;
    const ownerId = input.ownerId ?? user.id;
    if (ownerId !== user.id) await assertMember(input.orgId, ownerId);

    // 같은 컬럼 맨 위로 — position은 double이라 앞에 넣을 때 재정렬이 필요 없다.
    const { data: top } = await getSupabaseAdmin()
      .from('todos')
      .select('position')
      .eq('org_id', input.orgId)
      .eq('owner_id', ownerId)
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle();

    const position = top ? top.position - 1 : 0;

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .insert({
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

    const update: Record<string, unknown> = {};
    if (patch.title !== undefined) update.title = titleSchema.parse(patch.title);
    if (patch.dueDate !== undefined) update.due_date = dueSchema.parse(patch.dueDate) ?? null;
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

/** 삭제 — 주인 본인이나 방장만 */
export async function deleteTodo(todoId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);

    if (todo.owner_id !== user.id) {
      const { data: me } = await getSupabaseAdmin()
        .from('org_members')
        .select('role')
        .eq('org_id', todo.org_id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!me || (me.role !== 'owner' && me.role !== 'admin'))
        throw new Error('본인 할 일이나 방장만 삭제할 수 있습니다.');
    }

    const { error } = await getSupabaseAdmin().from('todos').delete().eq('id', todo.id);
    if (error) throw new Error(error.message);
    return null;
  });
}

/** 메모 추가 — "내가 대신 처리했음" 같은 한 줄을 남기는 용도 */
export async function addTodoNote(todoId: string, content: string): Promise<ApiResponse<TodoNote>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);
    const parsed = noteSchema.parse(content);

    const { data, error } = await getSupabaseAdmin()
      .from('todo_notes')
      .insert({ todo_id: todo.id, author_id: user.id, content: parsed })
      .select('id, todo_id, author_id, content, created_at')
      .single();
    if (error) throw new Error(error.message);

    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('display_name, avatar_emoji')
      .eq('id', user.id)
      .maybeSingle();

    return {
      ...(data as TodoNote),
      author_name: profile?.display_name,
      author_emoji: profile?.avatar_emoji ?? null,
    };
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
    const parsedNote = noteSchema.parse(note);

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
      .select('display_name, avatar_emoji')
      .eq('id', user.id)
      .maybeSingle();

    return {
      todo: updated as Todo,
      note: {
        ...(noteRow as TodoNote),
        author_name: profile?.display_name,
        author_emoji: profile?.avatar_emoji ?? null,
      },
    };
  });
}

export async function deleteTodoNote(noteId: string): Promise<ApiResponse<null>> {
  return wrap(async () => {
    const user = await requireAuth();
    const { data: note } = await getSupabaseAdmin()
      .from('todo_notes')
      .select('id, author_id')
      .eq('id', noteId)
      .maybeSingle();
    if (!note) throw new Error('메모를 찾을 수 없습니다.');
    if (note.author_id !== user.id) throw new Error('본인이 쓴 메모만 지울 수 있습니다.');

    const { error } = await getSupabaseAdmin().from('todo_notes').delete().eq('id', noteId);
    if (error) throw new Error(error.message);
    return null;
  });
}

/** 드래그 정렬 — 앞뒤 항목 position의 중간값을 준다 */
export async function reorderTodo(
  todoId: string,
  beforePosition: number | null,
  afterPosition: number | null
): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    const todo = await loadTodoForMember(todoId, user.id);

    let position: number;
    if (beforePosition === null && afterPosition === null) position = 0;
    else if (beforePosition === null) position = afterPosition! - 1;
    else if (afterPosition === null) position = beforePosition + 1;
    else position = (beforePosition + afterPosition) / 2;

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .update({ position })
      .eq('id', todo.id)
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as Todo;
  });
}
