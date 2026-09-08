import { apiRoute } from "@/lib/api-v1";
import { fetchOrgWebhook } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string }>((b) =>
  fetchOrgWebhook(b.orgId),
);
