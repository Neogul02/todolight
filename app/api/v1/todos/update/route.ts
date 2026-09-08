import { apiRoute } from "@/lib/api-v1";
import { updateTodo } from "@/app/actions/todos";

export const POST = apiRoute<{
  todoId: string;
  patch: Parameters<typeof updateTodo>[1];
}>((b) => updateTodo(b.todoId, b.patch));
