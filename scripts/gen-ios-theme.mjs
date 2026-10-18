// 웹 테마 토큰(app/globals.css)과 아바타 팔레트(lib/avatar.ts)를 Swift로 옮긴다.
// iOS가 색을 손으로 베끼면 테마를 고칠 때 한쪽만 바뀐다 — 진실은 웹 CSS 하나다.
//   node scripts/gen-ios-theme.mjs   → ios/TodoLight/TodoLight/Theme/Tokens.swift
// 읽지 못하는 값(var(), calc() 등)이 나오면 조용히 빼먹지 않고 실패한다.
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync('app/globals.css', 'utf8');
const avatarSrc = readFileSync('lib/avatar.ts', 'utf8');

const TOKENS = [
  'canvas', 'canvas-soft', 'surface', 'surface-alt',
  'ink', 'ink-secondary', 'ink-muted', 'ink-faint', 'ink-invert',
  'hairline', 'hairline-strong',
  'accent', 'accent-soft', 'accent-ink',
  'success', 'success-soft', 'warning', 'warning-soft', 'danger', 'danger-soft', 'danger-ink',
  'glass-bg', 'glass-bg-strong', 'glass-border', 'glass-sheen',
  'glass-card-bg', 'glass-card-bg-alt', 'canvas-tint-a', 'canvas-tint-b',
];
const THEMES = ['ink', 'ink-dark', 'solarized', 'nord', 'dracula'];
const DARK = ['ink-dark', 'nord', 'dracula'];

/** 선택자 목록 → 그 블록의 `--x: v;` 선언들 */
function blocks() {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map(s => s.trim()).filter(Boolean);
    const decls = {};
    for (const d of m[2].replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) decls[d[1]] = d[2].trim();
    out.push({ selectors, decls });
  }
  return out;
}

/**
 * 한 테마의 최종 토큰 — CSS 캐스케이드와 같은 순서로 덮는다:
 * 밝은 기본(:root, ink) → 어두운 공통 블록(어두운 테마만) → 그 테마만의 블록.
 */
function themeTokens(theme) {
  const merged = {};
  for (const { selectors, decls } of blocks()) {
    const base = selectors.includes(':root[data-theme="ink"]');
    const darkShared = DARK.includes(theme) && selectors.length > 1 && selectors.includes(`:root[data-theme="${theme}"]`);
    const own = selectors.length === 1 && selectors[0] === `:root[data-theme="${theme}"]`;
    if (base || darkShared || own) Object.assign(merged, decls);
  }
  return merged;
}

function rgba(value, where) {
  let m = /^#([0-9a-f]{6})$/i.exec(value);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255, 1]; }
  m = /^#([0-9a-f]{3})$/i.exec(value);
  if (m) { const [r, g, b] = m[1].split('').map(c => parseInt(c + c, 16)); return [r, g, b, 1]; }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`${where}: 읽을 수 없는 색 "${value}"`);
}

const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const swiftColor = ([r, g, b, a]) =>
  `Color(.sRGB, red: ${(r / 255).toFixed(4)}, green: ${(g / 255).toFixed(4)}, blue: ${(b / 255).toFixed(4)}, opacity: ${a})`;

let swift = `// 생성된 파일 — 직접 고치지 말 것. node scripts/gen-ios-theme.mjs
// 원본: app/globals.css (테마 토큰), lib/avatar.ts (아바타 팔레트)
import SwiftUI

struct ThemeTokens: Sendable {
${TOKENS.map(t => `    let ${camel(t)}: Color`).join('\n')}
    let isDark: Bool
}

enum ResolvedTheme: String, CaseIterable, Sendable {
${THEMES.map(t => `    case ${camel(t)} = "${t}"`).join('\n')}

    var tokens: ThemeTokens {
        switch self {
`;
for (const theme of THEMES) {
  const tk = themeTokens(theme);
  swift += `        case .${camel(theme)}:\n            return ThemeTokens(\n`;
  swift += TOKENS.map(t => {
    if (!(t in tk)) throw new Error(`${theme}: 토큰 --${t} 없음`);
    return `                ${camel(t)}: ${swiftColor(rgba(tk[t], `${theme} --${t}`))}`;
  }).join(',\n');
  swift += `,\n                isDark: ${DARK.includes(theme)}\n            )\n`;
}
swift += `        }
    }
}

/// 아바타 팔레트 — 사진이 없을 때 첫 글자 뒤 원 색. 웹 getAvatarColor와 같은 순서·해시를 쓴다.
enum AvatarPalette {
    static let colors: [(key: String, bg: Color, ink: Color)] = [
`;
const palette = [...avatarSrc.matchAll(/\{\s*key:\s*'(\w+)'[^}]*bg:\s*'(#[0-9a-f]{6})',\s*ink:\s*'(#[0-9a-f]{6})'\s*\}/gi)];
if (palette.length < 12) throw new Error(`아바타 팔레트를 ${palette.length}개만 읽음`);
swift += palette.map(p => `        ("${p[1]}", ${swiftColor(rgba(p[2], p[1]))}, ${swiftColor(rgba(p[3], p[1]))})`).join(',\n');
swift += `\n    ]\n}\n`;

writeFileSync('ios/TodoLight/TodoLight/Theme/Tokens.swift', swift);
console.log(`Tokens.swift: 테마 ${THEMES.length} × 토큰 ${TOKENS.length}, 아바타 ${palette.length}색`);
