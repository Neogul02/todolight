'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-hairline animate-pulse-soft', className)} />;
}

/** 흔한 달 모양(6주)에 맞춘 자리 수 — 실제 격자와 줄 수가 달라도 칸 크기는 aspect로 고정돼 있어 튀지 않는다 */
const WEEK_ROWS = 6;

/**
 * todos·members는 보드에서 이미 캐시돼 있어 즉시 있지만, org_events는 달력에서 처음 요청되는
 * 별도 쿼리라 도착까지 한 박자 늦다 — 그 사이 "날짜만 있고 띠·배지는 없는 빈 달력"이 보였다가
 * 나중에 채워지는 게 이 화면의 원래 증상이었다. 그 틈을 이 스켈레톤이 메운다:
 * 격자·목록 패널을 실제 CalendarView와 같은 자리·높이로 먼저 그려서, 데이터가 도착하면
 * 레이아웃이 튀지 않고 내용만 한 번에 채워진다.
 */
export function CalendarSkeleton() {
  const t = useTranslations('calendar');
  return (
    <div
      className="mx-auto flex h-full w-full max-w-[720px] flex-col px-3 pt-safe sm:h-auto sm:px-4 sm:pt-2 sm:pb-safe"
      aria-busy="true"
      aria-label={t('loadingAria')}
    >
      {/* 실제 달력(CalendarView)의 달 이동 줄과 같은 여백 — 데이터가 와도 자리가 안 튄다 */}
      <div className="flex items-center justify-between px-12 pb-2 sm:px-0">
        <span className="size-10" />
        <Bar className="h-5 w-28" />
        <span className="size-10" />
      </div>

      <div className="grid grid-cols-7">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="py-1" />
        ))}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-x-1 gap-y-1.5 sm:h-auto sm:auto-rows-auto">
        {Array.from({ length: WEEK_ROWS * 7 }, (_, i) => (
          <span
            key={i}
            className="flex min-h-0 flex-col items-center gap-1 rounded-xl border border-transparent pt-1.5 pb-1 sm:aspect-[6/7]"
          >
            <Bar className="size-3.5 rounded-full" />
          </span>
        ))}
      </div>

      <div className="mt-2 flex shrink-0 flex-col overflow-hidden border-t border-hairline pt-3">
        <div className="flex items-center justify-between pb-2">
          <Bar className="h-3.5 w-32" />
          <Bar className="h-8 w-16 rounded-lg" />
        </div>
        <ul className="flex flex-col gap-1.5">
          {[0, 1].map(i => (
            <li
              key={i}
              className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5"
            >
              <Bar className="size-8 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Bar className="h-3.5 w-2/3" />
                <Bar className="h-2.5 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
