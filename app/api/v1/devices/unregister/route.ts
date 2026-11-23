import { apiRoute } from '@/lib/api-v1';
import { unregisterPushDevice } from '@/app/actions/devices';

export const POST = apiRoute<{ token: string }>(b => unregisterPushDevice(b.token));
