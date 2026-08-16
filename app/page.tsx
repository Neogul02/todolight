import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export default async function LandingPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect('/board');

  const t = await getTranslations('landing');
  const POINTS = [
    { title: t('pointLightTitle'), body: t('pointLightBody') },
    { title: t('pointSimpleTitle'), body: t('pointSimpleBody') },
    { title: t('pointFastTitle'), body: t('pointFastBody') },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-[880px] flex-col px-5 pt-6 pb-8 sm:px-6 sm:pt-14">
      <header className="flex items-center justify-between">
        <span lang="en" className="text-title tracking-tight">
          todolight
        </span>
        <Link
          href="/login"
          className="-mr-2 rounded-lg px-2 py-2 text-[15px] font-medium text-ink-muted transition-colors active:bg-canvas-soft sm:text-[14px] sm:hover:text-ink"
        >
          {t('login')}
        </Link>
      </header>

      <section className="mt-14 max-w-[560px] sm:mt-20">
        <h1 className="text-[34px] font-bold leading-[1.15] tracking-[var(--tracking-headline)] text-ink sm:text-display">
          {t('headingLine1')}
          <br />
          {t('headingLine2')}
        </h1>
        <p className="mt-4 text-body-sm text-ink-muted sm:mt-5 sm:text-body-md">{t('tagline')}</p>

        <div className="mt-7 flex flex-col gap-2 sm:mt-8 sm:flex-row sm:flex-wrap">
          <Link
            href="/login?mode=signup"
            className="inline-flex h-13 items-center justify-center rounded-2xl bg-accent px-8 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('signup')}
          </Link>
          <Link
            href="/login"
            className="inline-flex h-13 items-center justify-center rounded-2xl border border-hairline-strong bg-surface px-8 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('login')}
          </Link>
        </div>
      </section>

      <section className="mt-16 grid gap-3 sm:mt-24 sm:grid-cols-3 sm:gap-4">
        {POINTS.map(p => (
          <div key={p.title} className="rounded-2xl border border-hairline bg-surface p-4 sm:p-5">
            <h2 className="text-title text-ink">{p.title}</h2>
            <p className="mt-1.5 text-caption text-ink-muted">{p.body}</p>
          </div>
        ))}
      </section>

      <footer className="mt-auto pt-16 pb-safe text-caption text-ink-faint">
        © {new Date().getFullYear()} todolight
      </footer>
    </main>
  );
}
