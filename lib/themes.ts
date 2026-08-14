export interface ThemeDef {
  key: string;
  name: string;
  /** 미리보기 스와치 (배경, 표면, 잉크) */
  swatch: [string, string, string];
}

/** 실제로 화면에 칠해지는 테마. data-theme 값이 된다 */
export const RESOLVED_THEMES = ['ink', 'ink-dark', 'solarized', 'nord', 'dracula'] as const;
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

/**
 * 고를 수 있는 값.
 * 윗줄은 기본 3종(맡기기·밝게·어둡게), 아랫줄은 널리 쓰이는 팔레트 3종이다.
 * 3열 격자에 두 줄로 딱 맞는다.
 */
export const THEMES: ThemeDef[] = [
  { key: 'system', name: '시스템', swatch: ['#ffffff', '#101010', '#8a8a8a'] },
  { key: 'ink', name: '화이트', swatch: ['#ffffff', '#f4f2ee', '#14120f'] },
  { key: 'ink-dark', name: '다크', swatch: ['#101010', '#232221', '#f5f2ec'] },
  { key: 'solarized', name: 'Solarized', swatch: ['#fdf6e3', '#eee8d5', '#073642'] },
  { key: 'nord', name: 'Nord', swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
  { key: 'dracula', name: 'Dracula', swatch: ['#282a36', '#44475a', '#bd93f9'] },
];

export const DEFAULT_THEME = 'system';

export function isValidTheme(key: string | null | undefined): boolean {
  return THEMES.some(t => t.key === key);
}

/** 고른 값과 기기 설정을 합쳐 실제로 칠할 테마를 정한다 */
export function resolveTheme(
  preference: string | null | undefined,
  prefersDark: boolean
): ResolvedTheme {
  const picked = RESOLVED_THEMES.find(t => t === preference);
  if (picked) return picked;
  // system이거나 알 수 없는 값(사라진 테마 등)이면 기기 설정을 따른다
  return prefersDark ? 'ink-dark' : 'ink';
}
