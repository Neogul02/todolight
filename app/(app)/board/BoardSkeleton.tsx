'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-hairline animate-pulse-soft', className)} />;
}

/** 카드마다 제목 길이를 달리해서 진짜 목록처럼 보이게 한다 */
const TITLE_WIDTHS = ['w-[70%]', 'w-[55%]', 'w-[40%]'];

/**
 * 로딩 중 컬럼 자리를 미리 잡아 둔다.
 * 실제 컬럼과 같은 폭·높이를 쓰기 때문에 데이터가 도착해도 레이아웃이 튀지 않는다.
 */
export function BoardSkeleton() {
  const t = useTranslations('board');
  return (
    <div
      className="flex h-full gap-3 overflow-hidden px-3 pt-safe pb-3 sm:px-4 sm:pt-0"
      aria-busy="true"
      aria-label={t('loadingAria')}
    >
      {[0, 1, 2].map(column => (
        <section
          key={column}
          className="flex h-full w-full shrink-0 flex-col rounded-2xl border border-hairline bg-canvas-soft/60 sm:w-[330px]"
        >
          <header className="flex items-center gap-2 px-3 pt-3 pb-2">
            <Bar className="size-8 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bar className="h-3.5 w-24" />
              <Bar className="h-2.5 w-16" />
            </div>
          </header>

          <div className="px-3 pb-2.5">
            <Bar className="h-11 w-full rounded-xl sm:h-9" />
          </div>

          <ul className="flex flex-col gap-2 px-3">
            {TITLE_WIDTHS.map((width, card) => (
              <li key={card} className="rounded-xl border border-hairline bg-surface px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <Bar className="size-5 shrink-0" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Bar className={cn('h-3.5', width)} />
                    <Bar className="h-3 w-12 rounded-full" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
