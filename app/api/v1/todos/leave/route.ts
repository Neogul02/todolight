import { apiRoute } from "@/lib/api-v1";
import { leaveTodo } from "@/app/actions/todo-participants";

export const POST = apiRoute<{ todoId: string }>((b) => leaveTodo(b.todoId));
