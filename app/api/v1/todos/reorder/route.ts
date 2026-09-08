import { apiRoute } from "@/lib/api-v1";
import { reorderTodo } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string; position: number }>((b) =>
  reorderTodo(b.todoId, b.position),
);
