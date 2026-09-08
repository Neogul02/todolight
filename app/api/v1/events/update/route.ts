import { apiRoute } from "@/lib/api-v1";
import { updateOrgEvent } from "@/app/actions/events";

export const POST = apiRoute<{
  eventId: string;
  patch: Parameters<typeof updateOrgEvent>[1];
}>((b) => updateOrgEvent(b.eventId, b.patch));
