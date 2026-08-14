'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addTodoNote,
  deleteTodo,
  restoreTodo,
  setTodoStatus,
  updateTodo,
} from '@/app/actions/todos';
import { clearTodoPending, markTodoPending } from '@/lib/pending-todos';
import { showMsg, showUndo } from '@/lib/toast';
import { boardKeys } from './useOrgBoard';
import type { Todo, TodoStatus } from '@/types/db';

/**
 * 보드의 할 일 쓰기 동작을 한곳에 모은다.
 *
 * 체크와 삭제는 낙관적으로 반영한다 — 모바일에서 서버 왕복(200~500ms)을 기다리면
 * 탭이 씹힌 것처럼 느껴진다. 실패하면 직전 캐시로 되돌리고 이유를 알린다.
 */
export function useTodoMutations(orgId: string | null) {
  const queryClient = useQueryClient();
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

  /** 서버가 보낸 최종 상태로 맞춘다 — 실시간 이벤트와 순서가 엇갈려도 여기서 수렴한다 */
  function resync() {
    queryClient.invalidateQueries({ queryKey: key });
  }

  /**
   * 요청이 끝났으니 실시간 병합을 다시 허용하고 서버 상태로 맞춘다.
   * 해제를 먼저 해야 뒤이은 refetch 결과가 정상적으로 반영된다.
   */
  function settle(todoId: string) {
    clearTodoPending(todoId);
    resync();
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

  const restore = useMutation({
    mutationFn: async (todo: Todo) => {
      const res = await restoreTodo(todo.id);
      if (!res.success) throw new Error(res.error);
      return todo;
    },
    // 되살리기는 목록 순서를 서버가 다시 알려줘야 해서 낙관적으로 끼워 넣지 않는다
    onError: (error: Error) => showMsg(error.message, 'error'),
    onSettled: resync,
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
    onSuccess: todo => showUndo('지웠어요.', () => restore.mutate(todo)),
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

  // 메모는 작성자 이름·아바타 조인이 필요해서 낙관적으로 그리지 않고 서버 결과를 기다린다.
  const addNote = useMutation({
    mutationFn: async (input: { todoId: string; content: string }) => {
      const res = await addTodoNote(input.todoId, input.content);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onError: (error: Error) => showMsg(error.message, 'error'),
    onSuccess: resync,
  });

  return { toggleStatus, edit, remove, restore, addNote };
}
