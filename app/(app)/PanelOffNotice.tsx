'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * 설정에서 끈 패널(달력·가계부)을 `?view=`로 직접 열었을 때.
 * 조용히 보드로 튕기면 "왜 안 열리지"가 되므로, 어디서 켜는지로 바로 보낸다.
 */
export function PanelOffNotice({ title }: { title: string }) {
  const t = useTranslations('common');
  return (
    <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-safe text-center">
      <h1 className="text-heading-1 text-ink">{title}</h1>
      <Link
        href="/me"
        className="mt-7 flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
      >
        {t('goToSettings')}
      </Link>
    </main>
  );
}
