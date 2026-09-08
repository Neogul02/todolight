import { apiRoute } from "@/lib/api-v1";
import { updateOrgWebhook } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; webhookUrl: string }>((b) =>
  updateOrgWebhook(b.orgId, b.webhookUrl),
);
