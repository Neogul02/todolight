import { apiRoute } from "@/lib/api-v1";
import { revokeInvite } from "@/app/actions/orgs";

export const POST = apiRoute<{ inviteId: string }>((b) =>
  revokeInvite(b.inviteId),
);
