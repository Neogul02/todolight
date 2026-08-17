import { BoardSkeleton } from './board/BoardSkeleton';
import { cn } from '@/lib/utils';

function Bar({ className }: { className?: string }) {
  return <span className={cn('block rounded-md bg-hairline animate-pulse-soft', className)} />;
}

/**
 * AppShellData(조직·프로필 조회)가 끝나기 전 즉시 그리는 자리.
 * 헤더는 --header-h로 실제 헤더와 높이를 맞춰 데이터가 도착해도 화면이 튀지 않게 하고,
 * 본문은 BoardSkeleton을 그대로 써서 앱 진입 시 가장 먼저 보이는 화면(보드)과 이어지게 한다.
 * 모바일은 실제 AppShell처럼 헤더가 없다 — sm:block으로 데스크톱에서만 보인다.
 * 아바타 자리의 원 하나는 모바일에서도 남겨 둔다(실제 화면에도 늘 떠 있으니까).
 */
export default function AppShellSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 hidden border-b border-hairline bg-canvas/85 backdrop-blur-md sm:block">
        <div className="mx-auto flex h-[var(--header-h)] w-full max-w-[1400px] items-center gap-1 px-2 sm:px-3">
          <div className="mr-1 flex min-w-0 flex-1 items-center gap-1.5 px-2">
            <Bar className="size-7 shrink-0 rounded-lg" />
            <Bar className="h-4 w-24" />
          </div>
          <Bar className="size-10 shrink-0 rounded-full" />
        </div>
      </header>
      <Bar className="fixed right-3 top-[calc(env(safe-area-inset-top)+8px)] z-40 size-11 rounded-full sm:hidden" />
      <div className="flex-1">
        <BoardSkeleton />
      </div>
    </div>
  );
}
