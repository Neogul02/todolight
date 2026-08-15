import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

/** 없는 주소로 들어왔을 때. 기본 화면은 앱 테마를 모른다 */
export default async function NotFound() {
  const t = await getTranslations('notFound');
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 py-10 pb-safe text-center">
      <p className="text-eyebrow text-ink-faint">404</p>
      <h1 className="text-heading-1 text-ink">{t('title')}</h1>
      <p className="max-w-[360px] text-body-sm text-ink-muted">{t('description')}</p>

      <Link
        href="/board"
        className="mt-6 flex h-13 w-full max-w-[320px] items-center justify-center rounded-2xl bg-accent text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
      >
        {t('toBoard')}
      </Link>
    </main>
  );
}
