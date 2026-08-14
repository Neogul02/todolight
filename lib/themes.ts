export interface ThemeDef {
  key: string;
  name: string;
  /** 미리보기 스와치 (배경, 표면, 잉크) */
  swatch: [string, string, string];
  /** 무료 테마인지 — 유료 테마는 결제 연동 전까지 잠금 */
  free: boolean;
}

export const THEMES: ThemeDef[] = [
  { key: 'sand', name: '샌드', swatch: ['#f3eee5', '#fbf9f5', '#14120f'], free: true },
  { key: 'ink', name: '잉크 (다크)', swatch: ['#171613', '#232220', '#f4f1ea'], free: false },
  { key: 'mint', name: '민트', swatch: ['#eef4f0', '#fbfdfc', '#0d5a3c'], free: false },
];

export const DEFAULT_THEME = 'sand';

export function isValidTheme(key: string | null | undefined): boolean {
  return THEMES.some(t => t.key === key);
}
