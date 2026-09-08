import { apiRoute } from "@/lib/api-v1";
import { removeMember } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; userId: string }>((b) =>
  removeMember(b.orgId, b.userId),
);
