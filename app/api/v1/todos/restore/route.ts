import { apiRoute } from "@/lib/api-v1";
import { restoreTodo } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string }>((b) => restoreTodo(b.todoId));
