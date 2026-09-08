import { apiRoute } from "@/lib/api-v1";
import { updateMemberOrder } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; orderedUserIds: string[] }>((b) =>
  updateMemberOrder(b.orgId, b.orderedUserIds),
);
