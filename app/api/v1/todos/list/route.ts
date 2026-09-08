import { apiRoute } from '@/lib/api-v1';
import { fetchOrgTodos } from '@/app/actions/todos';

export const POST = apiRoute<{ orgId: string }>(b => fetchOrgTodos(b.orgId));
