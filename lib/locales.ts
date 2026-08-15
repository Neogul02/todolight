export const LOCALES = ['ko', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ko';

/** 서버·클라이언트 양쪽이 읽는 쿠키 이름. profiles.locale은 기기 간 동기화용, 이 쿠키가 매 요청의 1차 출처다 */
export const LOCALE_COOKIE = 'todolight_locale';

export function isValidLocale(key: string | null | undefined): key is Locale {
  return LOCALES.some(l => l === key);
}
