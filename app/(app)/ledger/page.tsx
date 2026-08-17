import { redirect } from 'next/navigation';

/** 가계부도 `/board`의 패널이다 — 옛 주소는 리다이렉트로만 남긴다(calendar/page.tsx와 같은 이유) */
export default function LedgerPage() {
  redirect('/board?view=ledger');
}
