import { apiRoute } from "@/lib/api-v1";
import { respondToInvite } from "@/app/actions/orgs";

export const POST = apiRoute<{ inviteId: string; accept: boolean }>((b) =>
  respondToInvite(b.inviteId, b.accept),
);
