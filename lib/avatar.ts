export interface AvatarColor {
  key: string;
  name: string;
  /** 원 배경 */
  bg: string;
  /** 그 위 글자색 — 배경마다 대비를 따로 맞춰 뒀다 */
  ink: string;
}

/** 베이지 캔버스 위에서 서로 구분되면서 튀지 않는 톤으로 골랐다 */
export const AVATAR_COLORS: AvatarColor[] = [
  { key: 'stone', name: '스톤', bg: '#cfc7b6', ink: '#2b2823' },
  { key: 'clay', name: '클레이', bg: '#dcb69c', ink: '#40291b' },
  { key: 'rose', name: '로즈', bg: '#e0b2b6', ink: '#452327' },
  { key: 'amber', name: '앰버', bg: '#e3c88d', ink: '#3f3115' },
  { key: 'olive', name: '올리브', bg: '#c2ceA4', ink: '#2c3419' },
  { key: 'sea', name: '씨', bg: '#a6c8c5', ink: '#17332f' },
  { key: 'sky', name: '스카이', bg: '#b2c3dd', ink: '#1e2b40' },
  { key: 'plum', name: '플럼', bg: '#cbb8db', ink: '#2f2340' },
];

const FALLBACK = AVATAR_COLORS[0];

export function getAvatarColor(key: string | null | undefined, seed = ''): AvatarColor {
  const found = AVATAR_COLORS.find(c => c.key === key);
  if (found) return found;
  // 색을 고르지 않은 사람도 서로 구분되도록 id에서 결정적으로 하나 뽑는다
  if (!seed) return FALLBACK;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function isValidAvatarColor(key: string | null | undefined): boolean {
  return AVATAR_COLORS.some(c => c.key === key);
}
