import { cookies, headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { LOCALE_COOKIE, type Locale, isValidLocale } from '@/lib/locales';
import { negotiateLocale } from '@/lib/negotiate-locale';

/** 서버 액션에서 요청의 로케일을 읽는다 — 페이지 렌더(i18n/request.ts)와 같은 기준을 쓴다 */
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  return isValidLocale(raw) ? raw : negotiateLocale((await headers()).get('accept-language'));
}

/** 서버 액션의 에러·검증 메시지를 번역할 때 쓴다. 요청마다 새로 읽어야 로케일 전환이 바로 반영된다 */
export async function getActionT() {
  const locale = await getRequestLocale();
  return getTranslations({ locale, namespace: 'errors' });
}

/** zod 스키마를 함수로 만들어(`titleSchema(t)`) 요청별 t를 받게 할 때 쓰는 타입 */
export type ActionT = Awaited<ReturnType<typeof getActionT>>;
