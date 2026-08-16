'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-hairline animate-pulse-soft', className)} />;
}

/**
 * 총액 카드·목록 자리를 실제 크기와 비슷하게 미리 잡아 둔다.
 * board/calendar는 이미 스켈레톤이 있는데 ledger만 "로딩 중" 텍스트라, 데이터가 도착하면
 * 총액·목록이 레이아웃을 밀며 튀어나왔다 — 그 틈을 메운다.
 *
 * 총액 카드와 목록 사이에 지출 추가 폼 카드가 끼어 있어서(로딩 중에도 계속 쓸 수 있어야
 * 한다) 하나로 합치지 않고 두 조각으로 나눴다 — 각자 원래 있던 자리에 그대로 끼워 넣는다.
 */
export function LedgerSummarySkeleton() {
  const t = useTranslations('ledger');
  return (
    <div aria-busy="true" aria-label={t('loadingAria')}>
      <Bar className="mt-1 h-8 w-32" />
      <Bar className="mt-1.5 h-3 w-20" />
    </div>
  );
}

export function LedgerEntriesSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <li
          key={i}
          className="flex items-start gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5"
        >
          <Bar className="mt-0.5 size-8 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Bar className="h-3.5 w-2/3" />
            <Bar className="h-3 w-1/3" />
          </div>
          <Bar className="mt-0.5 h-3.5 w-14 shrink-0" />
        </li>
      ))}
    </ul>
  );
}
