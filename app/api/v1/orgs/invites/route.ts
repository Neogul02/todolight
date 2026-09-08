import { apiRoute } from "@/lib/api-v1";
import { fetchOrgInvites } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string }>((b) =>
  fetchOrgInvites(b.orgId),
);
