import { describe, expect, it } from 'vitest';
import { createTranslator } from 'use-intl/core';
import { LOCALES } from './locales';

type Tree = { [k: string]: string | Tree };
const load = async (l: string) => (await import(`../messages/${l}.json`)).default as Tree;

function flat(t: Tree, p = ''): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((o, [k, v]) => {
    if (typeof v === 'string') o[p + k] = v;
    else Object.assign(o, flat(v, `${p}${k}.`));
    return o;
  }, {});
}

// 자리표시 이름만 뽑는다 — `{count, plural, …}`의 count도 하나로 친다
const placeholders = (s: string) =>
  [...new Set([...s.matchAll(/\{(\w+)(?=[,}])/g)].map(m => m[1]))].sort();

describe('messages', async () => {
  const all = Object.fromEntries(
    await Promise.all(LOCALES.map(async l => [l, flat(await load(l))] as const))
  );
  const base = all.ko;

  it.each(LOCALES)('%s: 한국어와 키가 같다', l => {
    expect(Object.keys(all[l]).sort()).toEqual(Object.keys(base).sort());
  });

  it.each(LOCALES)('%s: 자리표시가 한국어와 같다', l => {
    for (const k of Object.keys(base)) {
      expect([k, placeholders(all[l][k])]).toEqual([k, placeholders(base[k])]);
    }
  });

  it.each(LOCALES)('%s: 모든 문구가 그 언어로 서식화된다', async l => {
    const t = createTranslator({ locale: l, messages: await load(l) });
    const values = { count: 1, events: 2, todos: 1, limit: 5 };
    for (const k of Object.keys(base)) {
      if (k.includes('consent')) continue; // 태그가 있는 리치 문구
      expect(() => t(k as never, values as never)).not.toThrow();
    }
  });

  it('영어 복수형', async () => {
    const t = createTranslator({ locale: 'en', messages: await load('en') }) as unknown as (
      k: string,
      v: Record<string, number>
    ) => string;
    expect(t('team.memberCount', { count: 1 })).toBe('1 member');
    expect(t('team.memberCount', { count: 3 })).toBe('3 members');
    expect(t('calendar.selectedCounts', { events: 1, todos: 2 })).toBe('1 event · 2 to-dos');
  });
});
