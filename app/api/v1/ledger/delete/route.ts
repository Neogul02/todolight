import { apiRoute } from "@/lib/api-v1";
import { deleteLedgerEntry } from "@/app/actions/ledger";

export const POST = apiRoute<{ id: string }>((b) => deleteLedgerEntry(b.id));
