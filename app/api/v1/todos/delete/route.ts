import { apiRoute } from "@/lib/api-v1";
import { deleteTodo } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string }>((b) => deleteTodo(b.todoId));
