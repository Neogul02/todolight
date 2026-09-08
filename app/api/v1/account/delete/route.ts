import { apiRoute } from "@/lib/api-v1";
import { deleteMyAccount } from "@/app/actions/profile";

export const POST = apiRoute<Record<string, never>>(() => deleteMyAccount());
