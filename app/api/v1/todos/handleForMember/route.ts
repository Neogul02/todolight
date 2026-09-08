import { apiRoute } from "@/lib/api-v1";
import { handleForMember } from "@/app/actions/todos";

export const POST = apiRoute<{ todoId: string; note: string }>((b) =>
  handleForMember(b.todoId, b.note),
);
