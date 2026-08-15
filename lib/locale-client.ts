'use client';

import { LOCALE_COOKIE, type Locale, isValidLocale } from '@/lib/locales';

/** 쿠키가 매 요청의 1차 출처다(i18n/request.ts) — 여기서 바꾸면 다음 렌더부터 반영된다 */
export function applyLocale(locale: string) {
  if (!isValidLocale(locale)) return;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

export function readLocaleCookie(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  const val = match ? decodeURIComponent(match[1]) : null;
  return isValidLocale(val) ? val : null;
}
