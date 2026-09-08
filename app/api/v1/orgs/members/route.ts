import { apiRoute } from "@/lib/api-v1";
import { fetchOrgMembers } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string }>((b) =>
  fetchOrgMembers(b.orgId),
);
