import { apiRoute } from "@/lib/api-v1";
import { fetchLedgerEntries } from "@/app/actions/ledger";

export const POST = apiRoute<{ orgId: string; month: string }>((b) =>
  fetchLedgerEntries(b.orgId, b.month),
);
