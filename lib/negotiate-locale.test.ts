import { describe, expect, it } from 'vitest';
import { negotiateLocale } from './negotiate-locale';

describe('negotiateLocale', () => {
  it('지원하는 언어 중 가장 선호하는 것', () => {
    expect(negotiateLocale('ja-JP,ja;q=0.9,en;q=0.8')).toBe('ja');
    expect(negotiateLocale('fr-FR,en;q=0.5,ko;q=0.9')).toBe('ko');
  });
  it('지원하는 언어가 없으면 영어, 헤더가 없으면 한국어', () => {
    expect(negotiateLocale('fr-FR,de;q=0.8')).toBe('en');
    expect(negotiateLocale(null)).toBe('ko');
    expect(negotiateLocale('*')).toBe('ko');
  });
});
