import { apiRoute } from "@/lib/api-v1";
import { fetchMyInvites } from "@/app/actions/orgs";

export const POST = apiRoute<Record<string, never>>(() => fetchMyInvites());
