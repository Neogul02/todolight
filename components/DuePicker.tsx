'use client';

import { useEffect, useMemo, useRef } from 'react';
import { addDays, cn, daysFromToday, todayKST } from '@/lib/utils';

/** 오늘을 가운데 두고 뒤로 2주, 앞으로 석 달. 그보다 먼 마감은 나중에 카드에서 고치면 된다 */
const PAST_DAYS = 14;
const FUTURE_DAYS = 90;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function labelOf(date: string): { top: string; bottom: string } {
  const diff = daysFromToday(date);
  const [, m, d] = date.split('-');
  const day = `${Number(m)}/${Number(d)}`;
  if (diff === 0) return { top: day, bottom: '오늘' };
  if (diff === 1) return { top: day, bottom: '내일' };
  if (diff === -1) return { top: day, bottom: '어제' };
  return { top: day, bottom: weekdayOf(date) };
}

/**
 * 마감일 선택 — 달력도 키보드도 띄우지 않는다.
 * 오늘을 기준으로 날짜가 가로로 늘어서 있고, 좌우로 밀어 고른다.
 * 버튼을 한 번씩 눌러 하루씩 옮기던 방식은 "다음 주 화요일"까지 가는 데 손이 너무 많이 갔다.
 */
export function DuePicker({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
}) {
  const today = todayKST();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const dates = useMemo(() => {
    const list: string[] = [];
    for (let i = -PAST_DAYS; i <= FUTURE_DAYS; i++) list.push(addDays(today, i));
    return list;
  }, [today]);

  // 열릴 때 선택된 날짜(기본은 오늘)가 화면 가운데 오게 맞춘다.
  // 스크롤이 0에서 시작하면 2주 전 날짜부터 보여서 매번 오른쪽으로 밀어야 한다.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const selected = selectedRef.current;
    if (!scroller || !selected) return;
    scroller.scrollLeft =
      selected.offsetLeft - scroller.clientWidth / 2 + selected.offsetWidth / 2;
    // 최초 한 번만 — 고를 때마다 화면이 튀면 연속으로 고르기 어렵다
  }, []);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        'flex gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={cn(
          'flex h-11 shrink-0 items-center rounded-xl border px-3 text-[13px] font-medium transition-colors sm:h-10',
          value === null
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-hairline bg-surface text-ink-faint'
        )}
      >
        마감 없음
      </button>

      {dates.map(date => {
        const { top, bottom } = labelOf(date);
        const active = value === date;
        const isToday = date === today;

        return (
          <button
            key={date}
            ref={active ? selectedRef : undefined}
            type="button"
            onClick={() => onChange(date)}
            aria-pressed={active}
            aria-label={date}
            className={cn(
              'flex h-11 w-[56px] shrink-0 flex-col items-center justify-center rounded-xl border tabular-nums transition-colors sm:h-10',
              active
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-hairline bg-surface text-ink',
              !active && isToday && 'border-hairline-strong font-semibold'
            )}
          >
            <span className="text-[13px] leading-tight">{top}</span>
            <span
              className={cn(
                'text-[10px] leading-tight',
                active ? 'text-accent-ink/70' : 'text-ink-faint'
              )}
            >
              {bottom}
            </span>
          </button>
        );
      })}
    </div>
  );
}
