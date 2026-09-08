'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { notifyDiscord, truncate } from '@/lib/discord';
import { requireAuth, wrap } from './_base';
import { assertMember, assertMembers, requireMembership } from '@/lib/guards';
import { formatRelativeDay } from '@/lib/utils';
import { type ActionT, getActionT } from '@/lib/server-i18n';
import type { ApiResponse } from '@/types/api';
import type { MemberRole, Todo, TodoNote, TodoStatus } from '@/types/db';

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

const TODO_COLUMNS =
  'id, org_id, owner_id, title, status, due_date, position, created_by, handled_by, completed_at, created_at, updated_at, deleted_at';

/**
 * 한 사람의 컬럼에 실어 보낼 **완료한 할 일**의 최대 개수.
 *
 * 보드는 완료를 3개만 펼치고 나머지는 접는다(`MemberColumn`의 `VISIBLE_DONE`).
 * 펼쳐 봤을 때 "최근에 뭘 끝냈나"를 훑기에 20이면 넉넉하고, 그 위로는 개수만 있으면 된다.
 * **줄일 때 주의**: 3(VISIBLE_DONE)보다 작아지면 접기 버튼이 의미를 잃는다.
 */
const BOARD_DONE_LIMIT = 20;

/** `fetch_org_board`가 돌려주는 jsonb의 모양 */
type BoardPayload = {
  todos: Todo[];
  notes: TodoNote[];
  participants: { todo_id: string; user_id: string }[];
  /** 주인 id → 그 사람이 완료한 할 일의 **총** 개수(위 상한과 무관한 전체) */
  done_totals: Record<string, number>;
};

/**
 * todo id로 조직을 되짚어 멤버 여부를 확인하고 해당 todo를 돌려준다.
 * role도 함께 돌려준다 — 삭제/복구 경로(assertCanRemove)가 이미 여기서 읽은 role을
 * 재사용하면 같은 조직-유저 쌍을 다시 조회하지 않아도 된다.
 */
async function loadTodoForMember(
  todoId: string,
  userId: string
): Promise<{ todo: Todo; role: MemberRole }> {
  const t = await getActionT();
  const { data, error } = await getSupabaseAdmin()
    .from('todos')
    .select(TODO_COLUMNS)
    .eq('id', todoId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(t('todoNotFound'));
  const todo = data as Todo;
  const role = await requireMembership(todo.org_id, userId);
  return { todo, role };
}

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
/**
 * 보드가 한 번에 필요한 모든 것 — 할 일 · 메모 · 참여자 · 주인별 완료 총 개수.
 *
 * **왕복 한 번이고 결과가 유계다.**
 *
 * 예전에는 네 가지(멤버 검사 · 할 일 · 메모 · 참여자)를 Promise.all로 함께 보냈다. 그건
 * 순차 왕복 네 번보다 훨씬 나았지만 두 가지가 남아 있었다 — 요청이 여전히 네 개고,
 * **조직의 모든 미삭제 할 일과 모든 메모를 통째로** 읽었다. 완료한 할 일은 영원히 쌓이기만
 * 하므로 이 조회는 무한히 커진다. 실제 데이터로 재 보니 살아 있는 127건 중 미완료는
 * 18건이었다 — 나머지 109건이 매번 실려 오지만 화면에는 사람당 3개만 펼쳐진다.
 *
 * 지금은 `fetch_org_board`가 한 번에 답한다:
 * - **미완료는 전부.** "지금 해야 할 일"이라 사람이 감당할 만큼만 쌓여 자연히 유계이고,
 *   컬럼 정렬(지난 마감 → 오늘 → 나중 → 마감 없음)이 전체를 봐야 성립한다.
 * - **완료는 주인별 최근 20개만.** 그보다 오래된 것은 `doneTotals`의 개수로만 온다 —
 *   보드는 원래 완료를 3개만 펼치고 나머지를 "+N개 더 보기"로 접고 있었다.
 * - 메모·참여자는 **돌려주는 할 일의 것만.**
 * - 멤버 검사는 함수 안에서 하고, 통과 못 하면 아무것도 만들지 않고 바로 예외다.
 *
 * 대가는 하나: 달력에서 **아주 오래전에 끝낸 할 일**은 그 날짜를 눌러도 안 나온다.
 * 미완료는 전부 있으므로 월 격자의 "남은 개수"와 미완료 목록은 그대로다.
 */
export async function fetchOrgTodos(
  orgId: string
): Promise<ApiResponse<{ todos: Todo[]; doneTotals: Record<string, number> }>> {
  return wrap(async () => {
    const user = await requireAuth();
    const t = await getActionT();

    const { data, error } = await getSupabaseAdmin()
      .rpc('fetch_org_board', {
        p_org: orgId,
        p_actor: user.id,
        p_done_limit: BOARD_DONE_LIMIT,
      })
      .single<BoardPayload>();
    if (error) {
      // 함수가 던지는 유일한 코드. 그대로 두면 raw 예외 문구가 토스트에 뜬다.
      if (error.message.includes('NOT_A_MEMBER')) throw new Error(t('notAMember'));
      throw new Error(error.message);
    }

    const byTodo = new Map<string, TodoNote[]>();
    data.notes.forEach(n => {
      const list = byTodo.get(n.todo_id) ?? [];
      list.push(n);
      byTodo.set(n.todo_id, list);
    });

    const participantsByTodo = new Map<string, string[]>();
    data.participants.forEach(p => {
      const list = participantsByTodo.get(p.todo_id) ?? [];
      list.push(p.user_id);
      participantsByTodo.set(p.todo_id, list);
    });

    return {
      todos: data.todos.map(t => ({
        ...t,
        notes: byTodo.get(t.id) ?? [],
        participant_ids: participantsByTodo.get(t.id) ?? [],
      })),
      doneTotals: data.done_totals,
    };
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

    // 남의 목록에 꽂는 경우 주인도 같은 조직인지 함께 본다(멤버 조회 한 번으로)
    await assertMembers(input.orgId, ownerId === user.id ? [user.id] : [user.id, ownerId]);

    /*
      **position 계산과 삽입을 한 문장으로 한다.**

      예전에는 "그 컬럼의 맨 위 position을 읽고 → 그보다 작은 값으로 insert"를 왕복 두 번에
      나눠 했다. 그 사이에 다른 사람이 같은 컬럼에 넣으면 둘이 같은 값을 읽어 **같은
      position으로 저장된다.** 지금 눈에 띄는 사고는 아니지만(정렬 동점은 created_at으로
      갈린다), position이 double인 이유가 "사이에 끼워 넣기"라서 값이 겹치기 시작하면
      앞으로 만들 드래그 정렬이 그 위에서 바로 무너진다.

      `insert_todo_at_top`은 컬럼(조직 × 주인) 단위 advisory lock 안에서 min을 읽고 넣는다 —
      같은 컬럼에 들어오는 삽입만 줄을 서고 다른 컬럼은 서로 기다리지 않는다.
      왕복도 2회에서 1회로 준다.
    */
    const { data, error } = await getSupabaseAdmin()
      .rpc('insert_todo_at_top', {
        p_id: id ?? null,
        p_org: input.orgId,
        p_owner: ownerId,
        p_title: title,
        p_due: dueDate,
        p_created_by: user.id,
      })
      .single<Todo>();
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
    const { todo } = await loadTodoForMember(todoId, user.id);
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
    const { todo } = await loadTodoForMember(todoId, user.id);
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

/**
 * 순서 바꾸기 — 꾹 눌러 드래그로 옮긴 뒤 새 위치(double)만 반영한다.
 * 어느 항목 사이에 끼워 넣을지는 클라이언트가 이미 계산해서 보낸다(두 이웃 position의 평균 등) —
 * 서버는 그 값을 그대로 저장할 뿐, 같은 마감일 그룹인지 같은 건 여기서 다시 검증하지 않는다
 * (position은 순전히 표시 순서일 뿐이라 잘못된 값이 들어와도 다른 사람 데이터를 해치지 않는다).
 */
export async function reorderTodo(todoId: string, position: number): Promise<ApiResponse<Todo>> {
  return wrap(async () => {
    const user = await requireAuth();
    const { todo } = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();
    const parsed = z.number().finite(t('invalidPosition')).parse(position);

    const { data, error } = await getSupabaseAdmin()
      .from('todos')
      .update({ position: parsed })
      .eq('id', todo.id)
      .select(TODO_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as Todo;
  });
}

/** 지우거나 되살릴 수 있는 사람: 할 일의 주인 · 그 할 일을 만든 사람 · 방장/관리자 */
async function assertCanRemove(todo: Todo, userId: string, role: MemberRole): Promise<void> {
  if (todo.owner_id === userId || todo.created_by === userId) return;
  if (role !== 'owner' && role !== 'admin') {
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
    const { todo, role } = await loadTodoForMember(todoId, user.id);
    await assertCanRemove(todo, user.id, role);

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
      .select(TODO_COLUMNS)
      .eq('id', todoId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(t('todoNotFound'));

    const todo = data as Todo;
    const role = await requireMembership(todo.org_id, user.id);
    await assertCanRemove(todo, user.id, role);

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
    const { todo } = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();
    const parsed = noteSchema(t).parse(content);

    // insert와 프로필 조회는 서로의 결과를 기다릴 이유가 없다 — 둘 다 todo.id/user.id만 있으면 된다.
    const [{ data, error }, { data: profile }] = await Promise.all([
      getSupabaseAdmin()
        .from('todo_notes')
        .insert({ todo_id: todo.id, author_id: user.id, content: parsed })
        .select('id, todo_id, author_id, content, created_at')
        .single(),
      getSupabaseAdmin()
        .from('profiles')
        .select('display_name, avatar_color, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);

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
    const { todo } = await loadTodoForMember(todoId, user.id);
    const t = await getActionT();
    const parsedNote = noteSchema(t).parse(note);

    // 완료 처리 · 메모 insert · 프로필 조회는 서로의 결과를 기다릴 이유가 없다 —
    // 셋 다 todo.id/user.id/parsedNote만으로 끝난다(fetchOrgTodos와 같은 이유).
    const [
      { data: updated, error },
      { data: noteRow, error: noteError },
      { data: profile },
    ] = await Promise.all([
      getSupabaseAdmin()
        .from('todos')
        .update({
          status: 'done',
          completed_at: new Date().toISOString(),
          handled_by: user.id,
        })
        .eq('id', todo.id)
        .select(TODO_COLUMNS)
        .single(),
      getSupabaseAdmin()
        .from('todo_notes')
        .insert({ todo_id: todo.id, author_id: user.id, content: parsedNote })
        .select('id, todo_id, author_id, content, created_at')
        .single(),
      getSupabaseAdmin()
        .from('profiles')
        .select('display_name, avatar_color, avatar_url')
        .eq('id', user.id)
        .maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (noteError) throw new Error(noteError.message);

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
