export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

const KST_OFFSET_MINUTES = 9 * 60;

/** UTC ISO 문자열 → KST 기준 YYYY-MM-DD */
export function toKSTDateString(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const kst = new Date(d.getTime() + KST_OFFSET_MINUTES * 60_000);
  return kst.toISOString().slice(0, 10);
}

/** 오늘(KST) YYYY-MM-DD */
export function todayKST(): string {
  return toKSTDateString(new Date());
}

/** "오늘" · "어제" · "3일 전" · "2026-08-01" */
export function formatRelativeDay(iso: string): string {
  const target = toKSTDateString(iso);
  const today = todayKST();
  if (target === today) return '오늘';

  const diffDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86_400_000
  );
  if (diffDays === 1) return '어제';
  if (diffDays === -1) return '내일';
  if (diffDays > 1 && diffDays <= 7) return `${diffDays}일 전`;
  if (diffDays < -1 && diffDays >= -7) return `${-diffDays}일 뒤`;
  return target;
}

/** HH:MM (KST) */
export function formatKSTTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MINUTES * 60_000);
  return kst.toISOString().slice(11, 16);
}

/** 마감일 상태 — 컬럼 배지 색 결정용 */
export function dueState(dueDate: string | null): 'none' | 'overdue' | 'today' | 'upcoming' {
  if (!dueDate) return 'none';
  const today = todayKST();
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'upcoming';
}

/** 이름에서 이니셜 한 글자 (아바타 이모지가 없을 때 대체) */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
