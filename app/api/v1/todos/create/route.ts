import { apiRoute } from '@/lib/api-v1';
import { createTodo } from '@/app/actions/todos';

export const POST = apiRoute<Parameters<typeof createTodo>[0]>(b => createTodo(b));
