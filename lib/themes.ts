export interface ThemeDef {
  key: string;
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
 * 이름은(로케일별) messages/*.json의 me.theme.names.{key}에 있다.
 */
export const THEMES: ThemeDef[] = [
  { key: 'system', swatch: ['#ffffff', '#101010', '#8a8a8a'] },
  { key: 'ink', swatch: ['#ffffff', '#f4f2ee', '#14120f'] },
  { key: 'ink-dark', swatch: ['#101010', '#232221', '#f5f2ec'] },
  { key: 'solarized', swatch: ['#fdf6e3', '#eee8d5', '#073642'] },
  { key: 'nord', swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
  { key: 'dracula', swatch: ['#282a36', '#44475a', '#bd93f9'] },
];

export const DEFAULT_THEME = 'system';

/*
  어두운 배경을 쓰는 테마 — globals.css에서 color-scheme: dark를 공유하는 것과 같은 묶음이다.
  iOS standalone 앱의 상태 바 색(apple-mobile-web-app-status-bar-style)은 테마별
  theme-color 미디어쿼리를 안 따르고 메타 태그 값 하나로만 정해져서, 테마가 바뀔 때마다
  이 묶음을 기준으로 그 메타 태그도 직접 맞춰 줘야 한다(app/layout.tsx의 인라인 스크립트,
  app/providers.tsx의 paint 참고).
*/
const DARK_THEMES: readonly ResolvedTheme[] = ['ink-dark', 'nord', 'dracula'];

export function isDarkTheme(theme: ResolvedTheme): boolean {
  return DARK_THEMES.includes(theme);
}

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
