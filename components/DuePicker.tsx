'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { addDays, cn, daysFromToday, todayKST } from '@/lib/utils';
import type { Locale } from '@/lib/locales';

/** 오늘을 가운데 두고 뒤로 2주, 앞으로 석 달. 그보다 먼 마감은 나중에 카드에서 고치면 된다 */
const PAST_DAYS = 14;
const FUTURE_DAYS = 90;

/**
 * 날짜 선택 — 달력도 키보드도 띄우지 않는다.
 * 오늘을 기준으로 날짜가 가로로 늘어서 있고, 좌우로 밀어 고른다.
 * 버튼을 한 번씩 눌러 하루씩 옮기던 방식은 "다음 주 화요일"까지 가는 데 손이 너무 많이 갔다.
 *
 * 마감일(오늘 기준 앞으로 석 달, "마감 없음" 있음)과 가계부의 쓴 날(보고 있는 달 하루씩,
 * 비울 수 없음)이 같은 조작을 쓴다 — 기준일·범위·"없음" 칸만 프롭으로 연다.
 * 화면마다 다른 피커를 만들면 한쪽에서 고친 조작감이 다른 쪽에 안 따라온다.
 */
export function DuePicker({
  value,
  onChange,
  className,
  allowNone = true,
  anchor,
  pastDays = PAST_DAYS,
  futureDays = FUTURE_DAYS,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  className?: string;
  /** "마감 없음" 칸을 둘지. 끄면 날짜를 비울 수 없다 */
  allowNone?: boolean;
  /**
   * 범위를 세는 기준 날짜. 기본은 오늘이다.
   * 가계부는 "보고 있는 달의 1일"을 넘겨 그 달 날짜만 나오게 한다 —
   * 오늘 기준으로 늘어놓으면 7월을 보면서 적은 지출이 8월로 저장된다.
   */
  anchor?: string;
  pastDays?: number;
  futureDays?: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('duePicker');
  const today = todayKST();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short' }), [locale]);

  function labelOf(date: string): { top: string; bottom: string } {
    const diff = daysFromToday(date);
    const [, m, d] = date.split('-');
    const day = `${Number(m)}/${Number(d)}`;
    if (diff === 0) return { top: day, bottom: t('today') };
    if (diff === 1) return { top: day, bottom: t('tomorrow') };
    if (diff === -1) return { top: day, bottom: t('yesterday') };
    return { top: day, bottom: weekdayFmt.format(new Date(`${date}T00:00:00Z`)) };
  }

  // 범위는 anchor 기준으로 세지만, 라벨의 "오늘/어제/내일"은 늘 실제 오늘 기준이다 —
  // 이번 달을 보고 있으면 그 자리에 "오늘"이 그대로 뜬다.
  const dates = useMemo(() => {
    const from = anchor ?? today;
    const list: string[] = [];
    for (let i = -pastDays; i <= futureDays; i++) list.push(addDays(from, i));
    return list;
  }, [anchor, today, pastDays, futureDays]);

  // 열릴 때 선택된 날짜(기본은 오늘)가 화면 가운데 오게 맞춘다.
  // 스크롤이 0에서 시작하면 2주 전 날짜부터 보여서 매번 오른쪽으로 밀어야 한다.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const selected = selectedRef.current;
    if (!scroller || !selected) return;
    /*
      offsetLeft로 재지 말 것 — 그 값은 스크롤러가 아니라 가장 가까운 positioned 조상
      기준이라, 스크롤러 자신이 positioned가 아니면(대부분 그렇다) 바깥 요소까지의 거리가
      섞여 들어와 선택 날짜가 화면 밖으로 밀린다. 실제로 가계부의 피커가 이것 때문에
      오늘을 지나친 자리에서 시작했다. 두 사각형의 차이로 재면 조상이 무엇이든 정확하다.
    */
    const box = scroller.getBoundingClientRect();
    const cell = selected.getBoundingClientRect();
    scroller.scrollLeft += cell.left - box.left - (box.width - cell.width) / 2;
    // 최초 한 번만 — 고를 때마다 화면이 튀면 연속으로 고르기 어렵다
  }, []);

  return (
    <div
      ref={scrollerRef}
      className={cn(
        // 스크롤 막대 숨김은 globals.css가 전역으로 잡는다
        'flex gap-1.5 overflow-x-auto overscroll-x-contain py-0.5',
        className
      )}
    >
      {allowNone && (
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
          {t('noDue')}
        </button>
      )}

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
