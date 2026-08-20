'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  addTodoNote,
  createTodo,
  deleteTodo,
  deleteTodoNote,
  reorderTodo,
  restoreTodo,
  setTodoStatus,
  updateTodo,
  updateTodoNote,
} from '@/app/actions/todos';
import { joinTodo, leaveTodo } from '@/app/actions/todo-participants';
import { clearTodoPending, markTodoPending } from '@/lib/pending-todos';
import { showMsg, showUndo } from '@/lib/toast';
import { boardKeys } from './useOrgBoard';
import type { Todo, TodoStatus } from '@/types/db';

/**
 * 뮤테이션이 끝난 뒤 서버 상태로 맞추는 재조회를 이만큼 미뤄 모은다.
 *
 * 체크를 다섯 번 연달아 누르면 예전엔 `fetchOrgTodos`가 다섯 번 돌았다 — 화면은 이미
 * 낙관적으로 맞아 있는데 왕복만 다섯 번 나가고, 그때마다 다음 낙관적 패치가 `cancelQueries`로
 * 그 요청들을 취소하느라 churn이 생겼다. 마지막 요청 기준 한 번만 돌리면 결과는 같다.
 *
 * 값이 이 정도인 이유: 연타 간격이 대략 150~400ms라 그보다 넉넉해야 한 묶음으로 모이고,
 * 더 늘리면 남이 바꾼 내용이 늦게 따라온다(실시간 구독이 그 사이를 메우긴 한다).
 */
const RESYNC_COALESCE_MS = 400;

/**
 * 조직별로 예약해 둔 재조회 타이머.
 *
 * `useTodoMutations`는 카드마다(그것도 카드 하나에 두 번) 불려서 인스턴스가 수십 개다 —
 * 훅 안의 ref에 두면 카드마다 따로 모여 여러 장을 연달아 누를 때 하나도 안 합쳐진다.
 * 모듈 수준에 둬야 같은 조직의 모든 카드가 같은 타이머를 나눠 쓴다(lib/pending-todos.ts와 같은 이유).
 */
const scheduledResync = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 보드의 할 일 쓰기 동작을 한곳에 모은다.
 *
 * 체크와 삭제는 낙관적으로 반영한다 — 모바일에서 서버 왕복(200~500ms)을 기다리면
 * 탭이 씹힌 것처럼 느껴진다. 실패하면 직전 캐시로 되돌리고 이유를 알린다.
 */
export function useTodoMutations(orgId: string | null) {
  const queryClient = useQueryClient();
  const t = useTranslations('toast');
  const tCommon = useTranslations('common');
  const key = boardKeys.todos(orgId ?? '');

  /**
   * 캐시를 즉시 바꾸고 되돌릴 스냅샷을 반환한다.
   *
   * 진행 중인 refetch를 먼저 취소해야 한다. onSettled마다 invalidate가 돌기 때문에
   * 이전 요청이 아직 날아다니는 상황이 흔한데, 그게 낙관적 패치보다 늦게 도착하면
   * 방금 바꾼 값을 옛날 값으로 덮어써서 체크가 저 혼자 풀리는 것처럼 보인다.
   */
  async function patch(updater: (todos: Todo[]) => Todo[]): Promise<Todo[] | undefined> {
    await queryClient.cancelQueries({ queryKey: key });
    const snapshot = queryClient.getQueryData<Todo[]>(key);
    queryClient.setQueryData<Todo[]>(key, old => (old ? updater(old) : old));
    return snapshot;
  }

  function rollback(snapshot: Todo[] | undefined, error: Error) {
    if (snapshot) queryClient.setQueryData<Todo[]>(key, snapshot);
    showMsg(error.message, 'error');
  }

  const scheduleKey = orgId ?? '';

  function cancelScheduledResync() {
    const timer = scheduledResync.get(scheduleKey);
    if (timer) clearTimeout(timer);
    scheduledResync.delete(scheduleKey);
  }

  /**
   * 서버가 보낸 최종 상태로 **지금** 맞춘다.
   * 낙관적으로 그리지 않는 동작(메모 추가·되살리기)에 쓴다 — 화면이 서버 응답을 기다리고
   * 있는 중이라 여기서 미루면 방금 쓴 메모가 늦게 나타난다.
   */
  function resyncNow() {
    cancelScheduledResync();
    queryClient.invalidateQueries({ queryKey: key });
  }

  /**
   * 서버가 보낸 최종 상태로 **곧** 맞춘다(연달아 부르면 마지막 것 하나만 돈다).
   * 이미 낙관적으로 반영해 둔 동작에 쓴다 — 화면은 벌써 맞아 있으니 왕복을 서두를 이유가 없고,
   * 실시간 이벤트와 순서가 엇갈려도 이 한 번으로 수렴한다.
   */
  function resyncSoon() {
    cancelScheduledResync();
    scheduledResync.set(
      scheduleKey,
      setTimeout(() => {
        scheduledResync.delete(scheduleKey);
        queryClient.invalidateQueries({ queryKey: key });
      }, RESYNC_COALESCE_MS)
    );
  }

  /**
   * 요청이 끝났으니 실시간 병합을 다시 허용하고 서버 상태로 맞춘다.
   *
   * **해제는 미루지 않는다.** 재조회는 모아서 한 번만 돌려도 되지만, 실시간 병합 차단이
   * 늦게 풀리면 그 사이 도착한 남의 변경이 통째로 버려진다.
   */
  function settle(todoId: string) {
    clearTodoPending(todoId);
    resyncSoon();
  }

  const toggleStatus = useMutation({
    mutationFn: async (input: { todo: Todo; next: TodoStatus; actorId: string }) => {
      const res = await setTodoStatus(input.todo.id, input.next);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async input => {
      const done = input.next === 'done';
      markTodoPending(input.todo.id);
      return {
        snapshot: await patch(todos =>
          todos.map(t =>
            t.id === input.todo.id
              ? {
                  ...t,
                  status: input.next,
                  // 서버가 채우는 값과 같은 규칙으로 미리 채워야 "대신 처리" 배지가 깜빡이지 않는다
                  handled_by: done ? input.actorId : null,
                  completed_at: done ? new Date().toISOString() : null,
                }
              : t
          )
        ),
      };
    },
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: (_data, _error, input) => settle(input.todo.id),
  });

  /**
   * 할 일 추가.
   *
   * 예전에는 컴포넌트가 `createTodo`를 직접 부르고 응답을 기다린 뒤 목록을 통째로
   * 다시 읽었다 — 서버 왕복 두 번(추가 ~350ms + 전체 재조회 ~300ms) 동안 화면이
   * 아무 반응도 하지 않아서 "가끔 렉이 걸린다"로 느껴졌다. 체크·삭제와 같은 규칙으로 맞춘다.
   *
   * id를 **클라이언트가 먼저 정해서** 보낸다. 임시 id로 그렸다가 나중에 바꾸면,
   * 그 사이 도착한 실시간 INSERT가 다른 id로 보여 카드가 둘로 늘어난다.
   * 같은 id로 저장하면 실시간 병합이 그냥 같은 행 갱신이 된다.
   */
  const create = useMutation({
    mutationFn: async (input: {
      todo: Todo;
      orgId: string;
    }) => {
      const res = await createTodo({
        id: input.todo.id,
        orgId: input.orgId,
        title: input.todo.title,
        ownerId: input.todo.owner_id,
        dueDate: input.todo.due_date,
      });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async input => {
      markTodoPending(input.todo.id);
      return { snapshot: await patch(todos => [input.todo, ...todos]) };
    },
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: (_data, _error, input) => settle(input.todo.id),
  });

  const restore = useMutation({
    mutationFn: async (todo: Todo) => {
      const res = await restoreTodo(todo.id);
      if (!res.success) throw new Error(res.error);
      return todo;
    },
    // 되살리기는 목록 순서를 서버가 다시 알려줘야 해서 낙관적으로 끼워 넣지 않는다
    onError: (error: Error) => showMsg(error.message, 'error'),
    onSettled: resyncNow,
  });

  const remove = useMutation({
    mutationFn: async (todo: Todo) => {
      const res = await deleteTodo(todo.id);
      if (!res.success) throw new Error(res.error);
      return todo;
    },
    onMutate: async todo => {
      markTodoPending(todo.id);
      return { snapshot: await patch(todos => todos.filter(t => t.id !== todo.id)) };
    },
    onError: (error: Error, _todo, context) => rollback(context?.snapshot, error),
    // 확인 창 없이 지우는 대신 되돌릴 기회를 준다 (소프트 삭제라 행은 남아 있다)
    onSuccess: todo => showUndo(t('todoDeleted'), tCommon('undo'), () => restore.mutate(todo)),
    onSettled: (_data, _error, todo) => settle(todo.id),
  });

  const edit = useMutation({
    mutationFn: async (input: { todo: Todo; title: string; dueDate: string | null }) => {
      const res = await updateTodo(input.todo.id, { title: input.title, dueDate: input.dueDate });
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async input => {
      markTodoPending(input.todo.id);
      return {
        snapshot: await patch(todos =>
          todos.map(t =>
            t.id === input.todo.id ? { ...t, title: input.title, due_date: input.dueDate } : t
          )
        ),
      };
    },
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: (_data, _error, input) => settle(input.todo.id),
  });

  /**
   * 순서 바꾸기 — 꾹 눌러 드래그로 옮긴 뒤 새 position만 반영한다.
   * 컬럼(MemberColumn)이 이웃 두 항목의 position 평균으로 새 값을 미리 계산해서 보낸다 —
   * 화면은 드래그하는 동안 이미 그 순서로 움직이고 있으니 낙관적 반영은 값만 맞추면 된다.
   */
  const reorder = useMutation({
    mutationFn: async (input: { todoId: string; position: number }) => {
      const res = await reorderTodo(input.todoId, input.position);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async input => {
      markTodoPending(input.todoId);
      return {
        snapshot: await patch(todos =>
          todos.map(t => (t.id === input.todoId ? { ...t, position: input.position } : t))
        ),
      };
    },
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: (_data, _error, input) => settle(input.todoId),
  });

  // 메모는 작성자 이름·아바타 조인이 필요해서 낙관적으로 그리지 않고 서버 결과를 기다린다.
  const addNote = useMutation({
    mutationFn: async (input: { todoId: string; content: string }) => {
      const res = await addTodoNote(input.todoId, input.content);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onError: (error: Error) => showMsg(error.message, 'error'),
    onSuccess: resyncNow,
  });

  // 내용만 바뀌고 작성자·아바타는 그대로라 addNote와 달리 낙관적으로 반영할 수 있다.
  const editNote = useMutation({
    mutationFn: async (input: { todoId: string; noteId: string; content: string }) => {
      const res = await updateTodoNote(input.noteId, input.content);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async input => ({
      snapshot: await patch(todos =>
        todos.map(t =>
          t.id === input.todoId
            ? {
                ...t,
                notes: t.notes?.map(n =>
                  n.id === input.noteId ? { ...n, content: input.content } : n
                ),
              }
            : t
        )
      ),
    }),
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: resyncSoon,
  });

  // 하드 삭제라 되돌릴 수 없다 — 짧은 메모 한 줄이라 할 일 삭제와 달리 실행취소 토스트 없이 바로 지운다.
  const deleteNote = useMutation({
    mutationFn: async (input: { todoId: string; noteId: string }) => {
      const res = await deleteTodoNote(input.noteId);
      if (!res.success) throw new Error(res.error);
      return input;
    },
    onMutate: async input => ({
      snapshot: await patch(todos =>
        todos.map(t =>
          t.id === input.todoId
            ? { ...t, notes: t.notes?.filter(n => n.id !== input.noteId) }
            : t
        )
      ),
    }),
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: (_data, _error, input) => settle(input.todoId),
  });

  // 보드 캐시는 컬럼별이 아니라 조직 전체의 flat한 목록 하나다 — 여러 컬럼에 걸쳐
  // 보이는 건 렌더할 때 파생되는 그룹핑일 뿐이라, participant_ids 하나만 patch하면
  // 어느 컬럼에서 눌러도 즉시 반영된다.
  const join = useMutation({
    mutationFn: async (input: { todoId: string; userId: string }) => {
      const res = await joinTodo(input.todoId);
      if (!res.success) throw new Error(res.error);
    },
    onMutate: async input => ({
      snapshot: await patch(todos =>
        todos.map(t =>
          t.id === input.todoId
            ? { ...t, participant_ids: [...new Set([...(t.participant_ids ?? []), input.userId])] }
            : t
        )
      ),
    }),
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: resyncSoon,
  });

  const leave = useMutation({
    mutationFn: async (input: { todoId: string; userId: string }) => {
      const res = await leaveTodo(input.todoId);
      if (!res.success) throw new Error(res.error);
    },
    onMutate: async input => ({
      snapshot: await patch(todos =>
        todos.map(t =>
          t.id === input.todoId
            ? { ...t, participant_ids: (t.participant_ids ?? []).filter(id => id !== input.userId) }
            : t
        )
      ),
    }),
    onError: (error: Error, _input, context) => rollback(context?.snapshot, error),
    onSettled: resyncSoon,
  });

  return {
    create,
    toggleStatus,
    edit,
    remove,
    restore,
    reorder,
    addNote,
    editNote,
    deleteNote,
    join,
    leave,
  };
}
