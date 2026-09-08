import { apiRoute } from "@/lib/api-v1";
import { deleteOrg } from "@/app/actions/orgs";

export const POST = apiRoute<{ orgId: string }>((b) => deleteOrg(b.orgId));
