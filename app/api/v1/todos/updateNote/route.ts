import { apiRoute } from "@/lib/api-v1";
import { updateTodoNote } from "@/app/actions/todos";

export const POST = apiRoute<{ noteId: string; content: string }>((b) =>
  updateTodoNote(b.noteId, b.content),
);
