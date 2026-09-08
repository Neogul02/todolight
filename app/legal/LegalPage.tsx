import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LEGAL_UPDATED, type LegalDoc } from '@/lib/legal';
import type { Locale } from '@/lib/locales';

/**
 * 약관 문서 한 장.
 *
 * **로그인 없이 열려야 한다.** App Store 심사자는 계정을 만들기 전에 개인정보 처리방침
 * URL을 열어 본다 — `/legal/*`는 `proxy.ts`의 `PROTECTED_PREFIXES`에 넣지 않는다.
 *
 * 글이라 폭을 좁게 잡는다(`max-w-[680px]`). 한 줄이 너무 길면 다음 줄 첫머리를 놓친다.
 */
export default async function LegalPage({ doc, titleKey }: { doc: LegalDoc; titleKey: string }) {
  const locale = (await getLocale()) as Locale;
  const t = await getTranslations('legal');
  const sections = doc[locale] ?? doc.ko;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col px-5 pt-safe pb-safe sm:px-6">
      <header className="flex h-14 items-center">
        <Link
          href="/"
          className="-ml-2 rounded-lg px-2 py-2 text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft sm:text-[14px] sm:hover:text-ink"
        >
          ‹ {t('backHome')}
        </Link>
      </header>

      <h1 className="mt-6 text-heading-1 text-ink">{t(titleKey)}</h1>
      <p className="mt-1.5 text-caption text-ink-faint">
        {t('lastUpdated', { date: LEGAL_UPDATED })}
      </p>

      <div className="mt-8 flex flex-col gap-7 pb-16">
        {sections.map(section => (
          <section key={section.heading}>
            <h2 className="text-title text-ink">{section.heading}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {section.body.map(paragraph => (
                <p key={paragraph} className="text-body-sm leading-relaxed text-ink-secondary">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
