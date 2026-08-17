import { redirect } from 'next/navigation';

/**
 * 달력은 이제 `/board`의 패널이다. 이 주소는 북마크·옛 링크·홈 화면 바로가기를 위해 남긴다 —
 * 지우면 이미 저장해 둔 사람이 404를 본다.
 */
export default function CalendarPage() {
  redirect('/board?view=calendar');
}
