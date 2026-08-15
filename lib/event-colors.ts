export interface EventColor {
  key: string;
  /** 달력 띠와 목록 점에 쓰는 색 */
  bar: string;
  /** 그 색 위에 올라가는 글자색 */
  ink: string;
}

/**
 * 일정 색.
 * 아바타 색(중간 밝기 파스텔)보다 진하다 — 아바타는 사람을 구분하는 배경이고,
 * 이건 얇은 띠라서 눈에 걸려야 한다. 화이트·블랙 두 테마 위에서 모두 보이는 채도로 골랐다.
 * 이름은(스크린리더용) messages/*.json의 event.colors.{key}에 로케일별로 있다.
 */
export const EVENT_COLORS: EventColor[] = [
  { key: 'slate', bar: '#6b7280', ink: '#ffffff' },
  { key: 'red', bar: '#d1544c', ink: '#ffffff' },
  { key: 'orange', bar: '#d97b2e', ink: '#ffffff' },
  { key: 'amber', bar: '#c99a1e', ink: '#241a00' },
  { key: 'green', bar: '#3f8f5f', ink: '#ffffff' },
  { key: 'teal', bar: '#2f8b86', ink: '#ffffff' },
  { key: 'blue', bar: '#4372b8', ink: '#ffffff' },
  { key: 'violet', bar: '#7a5cc0', ink: '#ffffff' },
];

const FALLBACK = EVENT_COLORS[0];

export function getEventColor(key: string | null | undefined): EventColor {
  return EVENT_COLORS.find(c => c.key === key) ?? FALLBACK;
}

export function isValidEventColor(key: string | null | undefined): boolean {
  return EVENT_COLORS.some(c => c.key === key);
}
