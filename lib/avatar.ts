export interface AvatarColor {
  key: string;
  name: string;
  /** 원 배경 */
  bg: string;
  /** 그 위 글자색 — 배경마다 대비를 따로 맞춰 뒀다 */
  ink: string;
}

/**
 * 아바타 색 팔레트.
 * 고르게 하지 않고 계정 id에서 결정적으로 배정한다 — 설정 화면을 늘리지 않으면서도
 * 팀원끼리 잘 겹치지 않는다. 밝은·어두운 테마 위에서 모두 읽히는 중간 밝기로 골랐고,
 * 팀이 12명을 넘으면 겹치기 시작하지만 이름이 함께 붙으므로 구분에는 문제없다.
 */
export const AVATAR_COLORS: AvatarColor[] = [
  { key: 'stone', name: '스톤', bg: '#cfc7b6', ink: '#2b2823' },
  { key: 'clay', name: '클레이', bg: '#dcb69c', ink: '#40291b' },
  { key: 'coral', name: '코랄', bg: '#e8b09a', ink: '#46251a' },
  { key: 'rose', name: '로즈', bg: '#e0b2b6', ink: '#452327' },
  { key: 'plum', name: '플럼', bg: '#cbb8db', ink: '#2f2340' },
  { key: 'lavender', name: '라벤더', bg: '#bdbfe0', ink: '#26264a' },
  { key: 'sky', name: '스카이', bg: '#b2c3dd', ink: '#1e2b40' },
  { key: 'sea', name: '씨', bg: '#a6c8c5', ink: '#17332f' },
  { key: 'mint', name: '민트', bg: '#a9d3b8', ink: '#17351f' },
  { key: 'olive', name: '올리브', bg: '#c2cea4', ink: '#2c3419' },
  { key: 'amber', name: '앰버', bg: '#e3c88d', ink: '#3f3115' },
  { key: 'sand', name: '샌드', bg: '#ded3bd', ink: '#3a3124' },
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

