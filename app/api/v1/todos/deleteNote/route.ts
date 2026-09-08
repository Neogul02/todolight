import { apiRoute } from "@/lib/api-v1";
import { deleteTodoNote } from "@/app/actions/todos";

export const POST = apiRoute<{ noteId: string }>((b) =>
  deleteTodoNote(b.noteId),
);
