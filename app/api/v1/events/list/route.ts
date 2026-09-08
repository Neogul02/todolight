import { apiRoute } from "@/lib/api-v1";
import { fetchOrgEvents } from "@/app/actions/events";

export const POST = apiRoute<{ orgId: string }>((b) => fetchOrgEvents(b.orgId));
