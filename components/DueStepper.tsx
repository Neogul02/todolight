'use client';

import { addDays, cn, daysFromToday, todayKST } from '@/lib/utils';

function label(date: string | null): string {
  if (!date) return '마감 없음';
  const diff = daysFromToday(date);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  const [, m, d] = date.split('-');
  const suffix = diff > 0 ? `+${diff}` : `${diff}`;
  return `${Number(m)}/${Number(d)} (${suffix})`;
}

/**
 * 마감일 입력 — 달력도 키보드도 띄우지 않는다.
 * 오늘을 기준으로 하루씩 밀고 당기는 것만 되면 충분하고, 모바일에서 네이티브 날짜 피커가
 * 화면 절반을 덮는 것보다 이쪽이 훨씬 빠르다. 가운데를 누르면 마감 없음으로 토글된다.
 */
export function DueStepper({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
}) {
  function step(delta: number) {
    // 마감이 없던 상태에서 누르면 오늘을 기준으로 시작한다
    onChange(addDays(value ?? todayKST(), delta));
  }

  const past = value ? daysFromToday(value) < 0 : false;

  return (
    <div
      className={cn(
        'flex h-11 items-center rounded-xl border border-hairline bg-surface sm:h-9',
        className
      )}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="하루 당기기"
        className="grid h-full w-10 shrink-0 place-items-center rounded-l-xl text-ink-muted transition-colors active:bg-canvas-soft"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3.5 8h9" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onChange(value ? null : todayKST())}
        aria-label="마감일 설정 여부"
        className={cn(
          'h-full min-w-0 flex-1 truncate px-1 text-center text-[13px] font-medium tabular-nums transition-colors',
          !value && 'text-ink-faint',
          past && 'text-danger'
        )}
      >
        {label(value)}
      </button>

      <button
        type="button"
        onClick={() => step(1)}
        aria-label="하루 미루기"
        className="grid h-full w-10 shrink-0 place-items-center rounded-r-xl text-ink-muted transition-colors active:bg-canvas-soft"
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
