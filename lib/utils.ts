import { DEFAULT_LOCALE, type Locale } from '@/lib/locales';

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/**
 * 로그인 후·메일 링크 복귀 후 돌아갈 곳을 정한다. 둘 다 쿼리스트링(next)을 그대로 받는데,
 * 검증 없이 쓰면 로그인 직후 임의 외부 사이트로 보내는 오픈 리다이렉트가 된다 —
 * "//evil.com"도 절대경로처럼 보이지만 브라우저는 프로토콜 상대 URL로 해석해 외부로 나간다.
 * 내부 경로("/"로 시작하되 "//"는 아님)만 허용한다.
 */
export function safeNextPath(raw: string | null | undefined, fallback = '/board'): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : fallback;
}

const KST_OFFSET_MINUTES = 9 * 60;

/** UTC ISO 문자열 → KST 기준 YYYY-MM-DD */
function toKSTDateString(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const kst = new Date(d.getTime() + KST_OFFSET_MINUTES * 60_000);
  return kst.toISOString().slice(0, 10);
}

/** 오늘(KST) YYYY-MM-DD */
export function todayKST(): string {
  return toKSTDateString(new Date());
}

/**
 * "오늘" · "어제" · "3일 전" · "2026-08-01" (로케일에 따라 "Today" · "3 days ago" 등)
 * Intl.RelativeTimeFormat의 numeric:'auto'가 언어별 어순·문법을 알아서 맞춰 준다 —
 * 한국어 전용으로 오늘/어제/내일을 따로 분기할 필요가 없다.
 */
export function formatRelativeDay(iso: string, locale: Locale = DEFAULT_LOCALE): string {
  const target = toKSTDateString(iso);
  const today = todayKST();

  const diffDays = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${target}T00:00:00Z`)) / 86_400_000
  );
  if (Math.abs(diffDays) <= 7) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-diffDays, 'day');
  }
  return new Intl.DateTimeFormat(locale).format(new Date(`${target}T00:00:00Z`));
}

/** HH:MM (KST) */
export function formatKSTTime(iso: string): string {
  const kst = new Date(new Date(iso).getTime() + KST_OFFSET_MINUTES * 60_000);
  return kst.toISOString().slice(11, 16);
}

/** 이번 달(KST) YYYY-MM */
export function currentMonthKST(): string {
  return todayKST().slice(0, 7);
}

/** YYYY-MM에 달 수를 더한다 */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

/** YYYY-MM의 첫날·마지막날 (경계 포함) */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    start: `${month}-01`,
    end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10),
  };
}

/** "2026년 8월" · "August 2026" */
export function formatMonth(month: string, locale: Locale = DEFAULT_LOCALE): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

/**
 * 금액 표시. 통화는 원화로 고정한다 —
 * 로케일에 따라 통화를 바꾸면 같은 조직 안에서 사람마다 다른 금액이 보인다.
 * 표기(₩12,000 / 12,000원)만 로케일을 따른다.
 */
export function formatMoney(amount: number, locale: Locale = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(amount);
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
