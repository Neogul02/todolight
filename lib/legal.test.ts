import { describe, expect, it } from 'vitest';
import { PRIVACY, TERMS } from './legal';
import { LOCALES } from './locales';

// 언어마다 조항과 문단이 1:1이어야 한쪽만 고치는 사고가 없다
describe.each([
  ['terms', TERMS],
  ['privacy', PRIVACY],
] as const)('%s', (_, doc) => {
  it.each(LOCALES)('%s: 한국어와 조항·문단 수가 같다', l => {
    expect(doc[l].map(s => s.body.length)).toEqual(doc.ko.map(s => s.body.length));
  });
});
