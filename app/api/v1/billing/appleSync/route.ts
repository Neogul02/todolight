import { apiRoute } from '@/lib/api-v1';
import { syncAppleTransaction } from '@/app/actions/billing';

export const POST = apiRoute<{ signedTransaction: string }>(b =>
  syncAppleTransaction(b.signedTransaction)
);
