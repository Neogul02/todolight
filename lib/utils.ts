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

/** YYYY-MM-DD에 일 수를 더한다 (문자열 기준이라 타임존 영향을 받지 않는다) */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + delta));
  return shifted.toISOString().slice(0, 10);
}

/** 오늘로부터 며칠 뒤인지 (음수면 지난 날짜) */
export function daysFromToday(date: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${todayKST()}T00:00:00Z`)) / 86_400_000
  );
}

/** 마감일 상태 — 컬럼 배지 색 결정용 */
export function dueState(dueDate: string | null): 'none' | 'overdue' | 'today' | 'upcoming' {
  if (!dueDate) return 'none';
  const today = todayKST();
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'upcoming';
}

/**
 * 이름 뒤에 붙일 주격 조사.
 * 받침이 있으면 "이", 없으면 "가" — 고정하면 "최진우이 부탁"처럼 어색해진다.
 * 한글이 아니면(영문·숫자) "가"로 둔다.
 */
export function subjectParticle(name: string): '이' | '가' {
  const last = name.trim().slice(-1);
  if (!last) return '가';
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return '가';
  // 한글 음절은 (초성, 중성, 종성) 조합이고 종성 인덱스 0이 받침 없음이다
  return (code - 0xac00) % 28 === 0 ? '가' : '이';
}

/** 이름에서 이니셜 한 글자 (아바타 이모지가 없을 때 대체) */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}
