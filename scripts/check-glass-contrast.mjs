/**
 * 유리 카드 대비 검사 — 계획서 §6-1 (AC-1 ~ AC-3)
 *
 * 카드를 반투명으로 만든 순간 "글자 대비"는 --surface 원색으로 잴 수 없게 된다.
 * 실제로 눈에 닿는 색은  캔버스 → 틴트 두 겹 → 카드 배경  을 합성한 결과다.
 * 이 스크립트가 그 합성을 대신 해 준다. 값을 눈대중으로 고치면 여섯 테마 중
 * 어딘가가 반드시 깨지는데, 그 "어딘가"를 사람이 찾는 건 비싸다.
 *
 * backdrop-filter: blur()는 주변 픽셀을 평균낼 뿐이라 평균 색을 보존한다.
 * 따라서 알파 합성만으로 근사해도 대비 판정에는 충분하다.
 *
 * 실행: node scripts/check-glass-contrast.mjs
 */
import { readFileSync } from 'node:fs';

const THEMES = ['ink', 'ink-dark', 'solarized', 'nord', 'dracula'];
const rawCss = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
/* 주석을 먼저 걷어낸다 — 선택자 바로 앞 주석이 선택자 문자열에 붙어 버리고,
   주석 안의 쉼표까지 선택자 구분자로 읽혀 테마 블록을 놓친다. */
const css = rawCss.replace(/\/\*[\s\S]*?\*\//g, '');

/* ── globals.css에서 테마별 토큰을 캐스케이드 순서대로 모은다 ──
   `:root`(민) 블록은 모든 테마에 적용되고, 어두운 테마 공통 블록처럼
   선택자를 여러 개 묶은 블록도 있어서 단순 분해로는 안 된다. */
function tokensFor(theme) {
  const vars = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const sel = m[1].trim();
    if (!sel.includes(':root')) continue;
    const applies = sel
      .split(',')
      .map((s) => s.trim())
      .some((s) => s === ':root' || s === `:root[data-theme="${theme}"]`);
    if (!applies) continue;
    for (const d of m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[d[1]] = d[2].trim();
    }
  }
  return vars;
}

/* ── 색 파싱/합성 ── */
function parse(c) {
  c = c.trim();
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split('').map((h) => parseInt(h + h, 16));
    return [r, g, b, 1];
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  throw new Error(`알 수 없는 색: ${c}`);
}

/** src를 dst 위에 얹는다 (dst는 불투명) */
function over(src, dst) {
  const [sr, sg, sb, sa] = src;
  return [
    sr * sa + dst[0] * (1 - sa),
    sg * sa + dst[1] * (1 - sa),
    sb * sa + dst[2] * (1 - sa),
    1,
  ];
}

const lum = ([r, g, b]) => {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/* 글자 등급별 기준선.
   절대 AA(4.5 / 3.0)는 참고용이다 — 이 앱의 기존 팔레트가 이미 그 아래인 조합이 있어서,
   절대 기준만 보면 "유리가 깨뜨렸다"와 "원래 그랬다"를 구분할 수 없다.
   진짜 게이트는 회귀다: 불투명 카드였을 때(baseline) 대비보다 의미 있게 나빠지면 안 된다. */
const LEVELS = [
  { token: '--ink', aa: 4.5, label: 'ink' },
  { token: '--ink-muted', aa: 4.5, label: 'muted' },
  { token: '--ink-faint', aa: 3.0, label: 'faint' },
];

/** 회귀 허용치 — baseline 대비 5%까지만 떨어질 수 있다 */
const REGRESSION_FLOOR = 0.95;

let regressions = 0;
let aaPreexisting = 0;
let aaNew = 0;
let checks = 0;
const rows = [];

for (const theme of THEMES) {
  const v = tokensFor(theme);
  const canvas = parse(v['--canvas']);
  const tintA = parse(v['--canvas-tint-a']);
  const tintB = parse(v['--canvas-tint-b']);

  /* 그라데이션의 양 극단 — AC-3은 한쪽만 재면 반대편이 깨진다고 말한다.
     최담 = 틴트가 완전히 사라진 자리(민 캔버스) / 최농 = 두 틴트가 겹쳐 가장 진해진 자리 */
  const points = [
    ['최담', canvas],
    ['최농', over(tintA, over(tintB, canvas))],
  ];

  const cards = [
    ['카드', parse(v['--glass-card-bg']), parse(v['--surface'])],
    ['완료카드', parse(v['--glass-card-bg-alt']), parse(v['--surface-alt'])],
  ];

  for (const [cName, card, opaque] of cards) {
    for (const { token, aa, label } of LEVELS) {
      const fg = parse(v[token]);
      const base = contrast(fg, opaque); // 유리 이전 상태
      for (const [pName, bg] of points) {
        const face = over(card, bg);
        const ratio = contrast(fg, face);
        const kept = ratio >= base * REGRESSION_FLOOR;
        if (!kept) regressions++;
        if (ratio < aa) {
          if (base < aa) aaPreexisting++;
          else aaNew++;
        }
        checks++;
        rows.push({
          theme, point: pName, card: cName, label,
          face: hex(face), base, ratio, aa, kept,
          aaOk: ratio >= aa, basePassedAa: base >= aa,
        });
      }
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\n유리 카드 대비 검사 — 불투명 기준선 대비 회귀\n');
console.log(
  pad('테마', 11) + pad('면', 10) + pad('글자', 7) + pad('지점', 7) +
  pad('합성색', 10) + pad('기준선', 8) + pad('유리', 8) + pad('변화', 9) + '판정'
);
console.log('─'.repeat(82));
let last = '';
for (const r of rows) {
  if (last && last !== r.theme) console.log('');
  last = r.theme;
  const delta = ((r.ratio / r.base - 1) * 100).toFixed(1);
  const marks = [];
  if (!r.kept) marks.push('회귀');
  if (!r.aaOk) marks.push(r.basePassedAa ? 'AA이탈(신규)' : 'AA미달(기존)');
  console.log(
    pad(r.theme, 11) + pad(r.card, 10) + pad(r.label, 7) + pad(r.point, 7) +
    pad(r.face, 10) + pad(r.base.toFixed(2), 8) + pad(r.ratio.toFixed(2), 8) +
    pad((delta >= 0 ? '+' : '') + delta + '%', 9) +
    (marks.length ? marks.join(' ') : 'OK')
  );
}
console.log('\n' + '─'.repeat(82));
console.log(`${checks}개 검사`);
console.log(`  회귀(기준선 대비 5% 초과 하락) : ${regressions}   ← 이번 변경이 만든 것. 0이어야 한다`);
console.log(`  AA 이탈 (신규)                : ${aaNew}   ← 유리가 AA를 깨뜨린 것. 0이어야 한다`);
console.log(`  AA 미달 (기존 팔레트)          : ${aaPreexisting}   ← 유리 이전부터 그랬던 것. 이번 범위 밖`);
if (regressions || aaNew) {
  console.log('\n실패한 테마의 --canvas-tint-* 알파를 낮추거나 --glass-card-bg 알파를 올린다.');
  console.log('토큰이 테마별이라 실패한 테마만 따로 고칠 수 있다.');
}
process.exit(regressions || aaNew ? 1 : 0);
