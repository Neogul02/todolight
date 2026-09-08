import { apiRoute } from "@/lib/api-v1";
import { createLedgerEntry } from "@/app/actions/ledger";

export const POST = apiRoute<Parameters<typeof createLedgerEntry>[0]>((b) =>
  createLedgerEntry(b),
);
