import { apiRoute } from '@/lib/api-v1';
import { fetchMyPro } from '@/app/actions/billing';

export const POST = apiRoute(() => fetchMyPro());
