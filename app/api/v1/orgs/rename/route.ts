import { apiRoute } from "@/lib/api-v1";
import { renameOrg } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; name: string }>((b) =>
  renameOrg(b.orgId, b.name),
);
