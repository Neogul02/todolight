import { apiRoute } from "@/lib/api-v1";
import { updateOrgImage } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string; imageUrl: string | null }>((b) =>
  updateOrgImage(b.orgId, b.imageUrl),
);
