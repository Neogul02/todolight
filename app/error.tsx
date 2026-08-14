'use client';

import { useEffect } from 'react';

/**
 * 앱 어디서든 렌더 중 터지면 여기가 뜬다.
 * Next.js 기본 오류 화면은 앱 테마를 전혀 모르기 때문에, 사고가 났을 때 화면이
 * 갑자기 남의 사이트처럼 보인다. 그 순간이야말로 "여기 있어도 된다"는 신호가 필요하다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app]', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 py-10 pb-safe text-center">
      <h1 className="text-heading-1 text-ink">문제가 생겼어요</h1>
      <p className="max-w-[360px] text-body-sm text-ink-muted">
        잠시 후 다시 시도해 주세요. 계속 이러면 새로고침해 주세요.
      </p>

      {/* digest는 배포본에서 로그를 찾는 유일한 실마리다 — 사용자가 알려 줄 수 있게 노출한다 */}
      {error.digest && (
        <p className="mt-1 font-mono text-[11px] text-ink-faint">오류 코드 {error.digest}</p>
      )}

      <div className="mt-6 flex w-full max-w-[320px] flex-col gap-2">
        <button
          type="button"
          onClick={reset}
          className="flex h-13 items-center justify-center rounded-2xl bg-accent text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
        >
          다시 시도
        </button>
        <a
          href="/board"
          className="flex h-13 items-center justify-center rounded-2xl border border-hairline-strong bg-surface text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
        >
          보드로 가기
        </a>
      </div>
    </main>
  );
}
