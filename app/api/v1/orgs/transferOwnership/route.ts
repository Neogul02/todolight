import { apiRoute } from "@/lib/api-v1";
import { transferOrgOwnership } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; newOwnerId: string }>((b) =>
  transferOrgOwnership(b.orgId, b.newOwnerId),
);
