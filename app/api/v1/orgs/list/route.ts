import { apiRoute } from "@/lib/api-v1";
import { fetchMyOrgs } from "@/app/actions/orgs";

export const POST = apiRoute<Record<string, never>>(() => fetchMyOrgs());
