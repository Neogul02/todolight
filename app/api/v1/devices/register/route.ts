import { apiRoute } from '@/lib/api-v1';
import { registerPushDevice } from '@/app/actions/devices';

export const POST = apiRoute<{ token: string }>(b => registerPushDevice(b.token));
