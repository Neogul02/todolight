import { apiRoute } from '@/lib/api-v1';
import { setTodoStatus } from '@/app/actions/todos';
import type { TodoStatus } from '@/types/db';

export const POST = apiRoute<{ todoId: string; status: TodoStatus }>(b =>
  setTodoStatus(b.todoId, b.status)
);
