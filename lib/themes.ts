export interface ThemeDef {
  key: string;
  name: string;
  hint: string;
  /** 미리보기 스와치 (배경, 표면, 잉크) */
  swatch: [string, string, string];
}

/** 실제로 화면에 칠해지는 테마. data-theme 값이 된다 */
export const RESOLVED_THEMES = ['ink', 'sand', 'ink-dark', 'midnight', 'forest'] as const;
export type ResolvedTheme = (typeof RESOLVED_THEMES)[number];

/** 사용자가 고를 수 있는 값. system은 골랐다기보다 "맡긴다"에 가깝다 */
export const THEMES: ThemeDef[] = [
  {
    key: 'system',
    name: '시스템',
    hint: '기기 설정을 따라가요',
    swatch: ['#ffffff', '#101010', '#8a8a8a'],
  },
  {
    key: 'ink',
    name: '화이트',
    hint: '항상 밝게',
    swatch: ['#ffffff', '#f4f2ee', '#14120f'],
  },
  {
    key: 'sand',
    name: '샌드',
    hint: '따뜻한 베이지',
    swatch: ['#f3eee5', '#fbf9f5', '#14120f'],
  },
  {
    key: 'ink-dark',
    name: '블랙',
    hint: '항상 어둡게',
    swatch: ['#101010', '#232221', '#f5f2ec'],
  },
  {
    key: 'midnight',
    name: '미드나잇',
    hint: '남색으로 기운 다크',
    swatch: ['#0f1420', '#212a3d', '#e8ecf5'],
  },
  {
    key: 'forest',
    name: '포레스트',
    hint: '초록으로 기운 다크',
    swatch: ['#0e1512', '#1f2a26', '#e6f0e9'],
  },
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
  // system이거나 알 수 없는 값이면 기기 설정을 따른다
  return prefersDark ? 'ink-dark' : 'ink';
}
