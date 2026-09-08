import { apiRoute } from "@/lib/api-v1";
import { updateMemberRole } from "@/app/actions/orgs";

export const POST = apiRoute<{
  orgId: string;
  userId: string;
  role: "admin" | "member";
}>((b) => updateMemberRole(b.orgId, b.userId, b.role));
