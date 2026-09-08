import { apiRoute } from "@/lib/api-v1";
import { deleteOrgEvent } from "@/app/actions/events";

export const POST = apiRoute<{ eventId: string }>((b) =>
  deleteOrgEvent(b.eventId),
);
