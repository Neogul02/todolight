import { apiRoute } from "@/lib/api-v1";
import { inviteMember } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; email: string }>((b) =>
  inviteMember(b.orgId, b.email),
);
