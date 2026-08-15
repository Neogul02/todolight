import { DEFAULT_LOCALE, type Locale, isValidLocale } from '@/lib/locales';

/**
 * 쿠키도 계정 설정도 없는 첫 방문 — 브라우저가 보낸 Accept-Language로 기본값을 정한다.
 * q값 순으로 정렬해 지원하는 로케일 중 가장 선호되는 걸 고른다.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(',')
    .map(part => {
      const [tag, qPart] = part.trim().split(';q=');
      const q = qPart ? parseFloat(qPart) : 1;
      return { lang: tag.trim().split('-')[0].toLowerCase(), q: Number.isNaN(q) ? 1 : q };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of ranked) {
    if (isValidLocale(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}
