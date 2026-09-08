import { apiRoute } from "@/lib/api-v1";
import { createOrg } from "@/app/actions/orgs";

export const POST = apiRoute<{ name: string }>((b) => createOrg(b.name));
