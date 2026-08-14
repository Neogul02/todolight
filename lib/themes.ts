export interface ThemeDef {
  key: string;
  name: string;
  /** 미리보기 스와치 (배경, 표면, 잉크) */
  swatch: [string, string, string];
  /** 무료 테마인지 — 유료 테마는 결제 연동 전까지 잠금 */
  free: boolean;
}

export const THEMES: ThemeDef[] = [
  { key: 'ink', name: '잉크 (화이트)', swatch: ['#ffffff', '#f4f2ee', '#14120f'], free: true },
  { key: 'ink-dark', name: '잉크 (블랙)', swatch: ['#101010', '#232221', '#f5f2ec'], free: true },
];

export const DEFAULT_THEME = 'ink';

export function isValidTheme(key: string | null | undefined): boolean {
  return THEMES.some(t => t.key === key);
}
