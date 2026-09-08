import { apiRoute } from "@/lib/api-v1";
import { restoreLedgerEntry } from "@/app/actions/ledger";

export const POST = apiRoute<{ id: string }>((b) => restoreLedgerEntry(b.id));
