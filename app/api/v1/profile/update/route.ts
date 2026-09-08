import { apiRoute } from "@/lib/api-v1";
import { updateMyProfile } from "@/app/actions/profile";

export const POST = apiRoute<Parameters<typeof updateMyProfile>[0]>((b) =>
  updateMyProfile(b),
);
