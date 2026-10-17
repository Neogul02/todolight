import { apiRoute } from "@/lib/api-v1";
import { giveTodo } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string; toUserId: string; note?: string | null }>((b) =>
  giveTodo(b.todoId, b.toUserId, b.note)
);
