import { apiRoute } from "@/lib/api-v1";
import { joinTodo } from "@/app/actions/todo-participants";

export const POST = apiRoute<{ todoId: string }>((b) => joinTodo(b.todoId));
