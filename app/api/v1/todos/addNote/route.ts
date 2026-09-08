import { apiRoute } from "@/lib/api-v1";
import { addTodoNote } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string; content: string }>((b) =>
  addTodoNote(b.todoId, b.content),
);
