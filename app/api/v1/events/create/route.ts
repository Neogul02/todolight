import { apiRoute } from "@/lib/api-v1";
import { createOrgEvent } from "@/app/actions/events";

export const POST = apiRoute<Parameters<typeof createOrgEvent>[0]>((b) =>
  createOrgEvent(b),
);
