import { cn } from '@/lib/utils';

function Bar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span className={cn('block rounded-md bg-hairline animate-pulse-soft', className)} style={style} />
  );
}

/**
 * 로딩 중 컬럼 자리를 미리 잡아 둔다.
 * 실제 컬럼과 같은 폭·높이를 쓰기 때문에 데이터가 도착해도 레이아웃이 튀지 않는다.
 */
export function BoardSkeleton() {
  return (
    <div
      className="board-viewport flex gap-3 overflow-hidden px-3 pb-3 sm:px-4"
      aria-busy="true"
      aria-label="보드를 불러오는 중"
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
            {[0, 1, 2].map(card => (
              <li key={card} className="rounded-xl border border-hairline bg-surface px-3 py-3">
                <div className="flex items-start gap-2.5">
                  <Bar className="size-5 shrink-0" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Bar className="h-3.5" style={{ width: `${70 - card * 15}%` }} />
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
