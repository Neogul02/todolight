import { apiRoute } from "@/lib/api-v1";
import { restoreOrgEvent } from "@/app/actions/events";

export const POST = apiRoute<{ eventId: string }>((b) =>
  restoreOrgEvent(b.eventId),
);
