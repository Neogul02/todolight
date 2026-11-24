import { apiRoute } from '@/lib/api-v1';
import { fetchOrgPlan } from '@/app/actions/billing';

export const POST = apiRoute<{ orgId: string }>(b => fetchOrgPlan(b.orgId));
