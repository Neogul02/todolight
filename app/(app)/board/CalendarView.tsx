'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { useResizablePanel } from '@/hooks/useResizablePanel';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui';
import { getEventColor } from '@/lib/event-colors';
import { useOrgEvents } from '@/hooks/useOrgEvents';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { vibrateTick } from '@/lib/haptics';
import { addDays, cn, todayKST } from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { MemberSummary, OrgEvent, Todo } from '@/types/db';
import { EventSheet } from './EventSheet';

/** 한 칸에 띠를 무한히 쌓을 수는 없다. 넘치면 개수만 알린다 */
const MAX_LANES = 3;
/** 격자 칸 사이 가로 간격(gap-x-1). 여러 칸을 가로지르는 띠의 폭 계산에 쓴다 */
const CELL_GAP_PX = 4;
/** 점 모드(칸이 좁을 때)에서 한 칸에 찍는 점의 최대 개수 — 넘치면 +N */
const MAX_DOTS = 4;
/**
 * 목록 패널이 차지하는 화면 비율. 아래에서부터 "살짝 보임 · 반반 · 목록 위주".
 * 맨 아래 값이 0이 아닌 이유: 목록은 늘 보여야 한다. 0이면 예전처럼 "없는 화면"이 된다.
 */
const PANEL_SNAPS = [0.24, 0.5, 0.76];

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** YYYY-MM 의 말일 */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function minDate(...dates: string[]): string {
  return dates.reduce((a, b) => (a < b ? a : b));
}

/**
 * 일정마다 고정 줄(lane)을 매긴다.
 *
 * 날짜별로 그때그때 쌓으면 위 일정이 끝나는 순간 아래 일정이 한 줄 위로 튄다 —
 * 같은 일정의 띠가 주 중간에서 위아래로 꺾여 보인다.
 * 겹치지 않는 일정끼리는 같은 줄을 다시 쓴다(구간 분할).
 */
function assignLanes(events: OrgEvent[]): Map<string, number> {
  const laneEnds: string[] = [];
  const laneOf = new Map<string, number>();

  [...events]
    .sort((a, b) => (a.start_date === b.start_date ? 0 : a.start_date < b.start_date ? -1 : 1))
    .forEach(e => {
      let lane = laneEnds.findIndex(end => end < e.start_date);
      if (lane === -1) {
        laneEnds.push(e.end_date);
        lane = laneEnds.length - 1;
      } else {
        laneEnds[lane] = e.end_date;
      }
      laneOf.set(e.id, lane);
    });

  return laneOf;
}

/** YYYY-MM 의 1일부터 말일까지, 앞뒤를 빈 칸으로 채운 7열 격자 */
function monthGrid(month: string): (string | null)[] {
  const first = `${month}-01`;
  const startWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();

  const days: (string | null)[] = Array.from({ length: startWeekday }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) days.push(d);
  // 마지막 줄을 채워야 칸 크기가 들쭉날쭉하지 않다
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthYearLabel(month: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' }).format(
    new Date(`${month}-01T00:00:00Z`)
  );
}

function formatRange(event: OrgEvent): string {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${Number(m)}/${Number(day)}`;
  };
  return event.start_date === event.end_date
    ? fmt(event.start_date)
    : `${fmt(event.start_date)} – ${fmt(event.end_date)}`;
}

/**
 * 조직 전체를 마감일·일정 기준으로 훑는 뷰.
 * 보드가 "누가 무엇을 들고 있나"라면 달력은 "언제 몰려 있나"를 본다.
 *
 * 할 일(todos)과 일정(org_events)은 다른 것이다 — 일정은 기간을 갖고 담당자가 없으며
 * 보드에는 뜨지 않는다. 달력에서만 만나는 셈이다.
 */
export function CalendarView({
  orgId,
  todos,
  members,
  showDone,
  currentUserId,
  isManager,
  onHandoff,
}: {
  orgId: string | null;
  todos: Todo[];
  members: MemberSummary[];
  showDone: boolean;
  currentUserId: string;
  isManager: boolean;
  /** 남의 할 일을 체크하면 "대신 처리" 메모를 받아야 한다 — 그 모달을 여는 콜백 */
  onHandoff: (todo: Todo) => void;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('calendar');
  const tBoard = useTranslations('board');
  const today = todayKST();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  /** 어느 쪽으로 넘겼는지 — 들어오고 나가는 방향을 맞춰야 넘긴 느낌이 난다 */
  const [direction, setDirection] = useState(0);
  const [selected, setSelected] = useState(today);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  /*
    목록은 늘 화면에 있다. 핸들을 위아래로 끌면 목록이 커지고 그만큼 달력이 줄어든다 —
    "이번 달이 어떻게 생겼나"와 "오늘 뭐가 있나"는 번갈아 보는 것이지 둘 중 하나를
    고르는 게 아니다. 예전처럼 날짜를 눌러야만 목록이 나타나면, 목록이 있다는 것 자체를
    모르는 사람이 생긴다.
    데스크톱은 세로 여유가 있어 둘 다 그냥 펴 둔다(enabled=false).
  */
  const panel = useResizablePanel({
    snaps: PANEL_SNAPS,
    initial: 0,
    containerRef: rootRef,
    enabled: !isDesktop,
  });
  /** 목록이 커지면 칸이 납작해진다 — 그 높이에는 일정 띠가 안 들어가서 점으로 바꾼다 */
  const compact = panel.ratio > PANEL_SNAPS[0] + 0.05;
  const [editing, setEditing] = useState<OrgEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const events = useOrgEvents(orgId);
  const { toggleStatus } = useTodoMutations(orgId);

  // TodoCard와 같은 규칙 — 남의 할 일을 완료로 바꾸는 건 "대신 처리"라 메모를 반드시 받는다.
  function toggleDone(todo: Todo) {
    const done = todo.status === 'done';
    if (!done && todo.owner_id !== currentUserId) {
      onHandoff(todo);
      return;
    }
    if (!done) vibrateTick();
    toggleStatus.mutate({ todo, next: done ? 'todo' : 'done', actorId: currentUserId });
  }

  /** 일요일부터 시작하는 한 주의 요일 이름을 로케일에 맞게 뽑는다 (2023-01-01은 일요일) */
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2023, 0, 1 + i))));
  }, [locale]);

  /** 스크린리더가 읽을 하루 요약 — "8월 15일, 남은 할 일 2개, 일정 팝업 준비 기간" */
  const describeDay = useCallback(
    (date: string, remaining: number, dayEvents: OrgEvent[]): string => {
      const dateLabel = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric' }).format(
        new Date(`${date}T00:00:00Z`)
      );
      const parts = [dateLabel];
      if (remaining > 0) parts.push(t('remainingCount', { count: remaining }));
      if (dayEvents.length > 0)
        parts.push(t('eventsList', { list: dayEvents.map(e => e.title).join(', ') }));
      return parts.join(', ');
    },
    [locale, t]
  );

  /*
    달을 넘길 때 선택 날짜도 같이 옮긴다.
    안 옮기면 8월 15일을 고른 채 9월로 넘어가서, 보고 있는 달과 아래 목록이 어긋난다.
    같은 일자를 지키되 그 달에 없으면 말일로 붙인다 (1/31 → 2/28).
  */
  const shift = useCallback(
    (delta: number) => {
      // setMonth 업데이터 안에서 setSelected를 부르지 않는다 —
      // 업데이터는 순수해야 하고 StrictMode에서 두 번 불릴 수 있다.
      const next = shiftMonth(month, delta);
      const end = lastDayOfMonth(next);
      const candidate = `${next}-${selected.slice(-2)}`;

      setDirection(delta);
      setMonth(next);
      setSelected(candidate > end ? end : candidate);
    },
    [month, selected]
  );

  /** 이번 달이 아니면 돌아올 길을 준다 — 몇 달 넘긴 뒤 오늘을 찾아 되짚는 건 번거롭다 */
  const awayFromToday = month !== today.slice(0, 7);
  const goToday = useCallback(() => {
    setDirection(month < today.slice(0, 7) ? 1 : -1);
    setMonth(today.slice(0, 7));
    setSelected(today);
  }, [month, today]);

  // 손가락으로도 마우스로도 옆으로 밀어 달을 넘긴다
  const swipeRef = useHorizontalSwipe(shift);

  const reduceMotion = useReducedMotion();

  const visible = useMemo(
    () => (showDone ? todos : todos.filter(t => t.status !== 'done')),
    [todos, showDone]
  );

  /** 날짜 → 그 날 마감인 할 일. 마감이 없는 건 달력에 설 자리가 없다 */
  const todosByDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    visible.forEach(t => {
      if (!t.due_date) return;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    });
    return map;
  }, [visible]);

  /**
   * 날짜 → 그 날에 걸친 일정.
   * 일정은 기간이라 하루마다 다시 계산하면 O(날짜 × 일정)이 된다 —
   * 시작일부터 종료일까지 한 번만 훑어 미리 깔아 둔다.
   */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, OrgEvent[]>();
    (events.data ?? []).forEach(e => {
      for (let d = e.start_date; d <= e.end_date; d = addDays(d, 1)) {
        const list = map.get(d) ?? [];
        list.push(e);
        map.set(d, list);
      }
    });
    return map;
  }, [events.data]);

  const laneOf = useMemo(() => assignLanes(events.data ?? []), [events.data]);

  const memberOf = useMemo(() => {
    const map = new Map(members.map(m => [m.user_id, m]));
    return (id: string) => map.get(id);
  }, [members]);

  const days = monthGrid(month);
  const monthFirst = `${month}-01`;
  const monthLast = lastDayOfMonth(month);
  // 안 끝난 일이 위, 완료한 일은 아래로 — 일정(selectedEvents)은 이 정렬과 무관하게 늘 맨 위에 고정된다
  const selectedTodos = [...(todosByDate.get(selected) ?? [])].sort(
    (a, b) => Number(a.status === 'done') - Number(b.status === 'done')
  );
  const selectedEvents = eventsByDate.get(selected) ?? [];
  const undated = visible.filter(t => !t.due_date);
  const monthLabel = monthYearLabel(month, locale);

  function openNewEvent() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEvent(event: OrgEvent) {
    setEditing(event);
    setSheetOpen(true);
  }

  /**
   * 날짜를 탭하면 그 날짜를 고르고, 목록이 살짝만 보이는 상태였으면 반쯤 펴 준다.
   * 이미 편 상태에서는 건드리지 않는다 — 날짜만 바꿔 가며 훑을 때 높이가 매번 튀면 어지럽다.
   */
  function selectDate(date: string) {
    setSelected(date);
    panel.expandAtLeast(1);
  }

  return (
    <div
      ref={rootRef}
      className="calendar-viewport mx-auto flex w-full max-w-[720px] flex-col px-3 pt-2 sm:h-auto sm:px-4 sm:pb-safe"
    >
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label={t('prevMonth')}
          className="grid size-10 place-items-center rounded-xl text-[18px] text-ink-muted active:bg-canvas-soft"
        >
          ‹
        </button>
        <span className="flex items-center gap-2">
          <p className="text-title tabular-nums text-ink" aria-live="polite">
            {monthLabel}
          </p>
          {awayFromToday && (
            <button
              type="button"
              onClick={goToday}
              className="h-7 rounded-lg border border-hairline px-2 text-[12px] font-medium text-ink-muted transition-colors active:bg-canvas-soft"
            >
              {t('today')}
            </button>
          )}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label={t('nextMonth')}
          className="grid size-10 place-items-center rounded-xl text-[18px] text-ink-muted active:bg-canvas-soft"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7" role="row">
        {weekdays.map(w => (
          <span
            key={w}
            role="columnheader"
            className="py-1 text-center text-[11px] font-medium text-ink-faint"
          >
            {w}
          </span>
        ))}
      </div>

      {/*
        touch-action: pan-y — 가로 제스처는 우리가 쓰고 세로 스크롤은 브라우저에 남긴다.
        날짜 숫자를 드래그로 선택하게 두면 넘기는 동안 텍스트가 잡히므로 선택을 막는다.
      */}
      {/*
        모바일에서는 격자가 **남은 높이를 그대로 받아** 줄 수만큼 나눠 갖는다
        (flex-1 min-h-0 + auto-rows-fr). 패널을 위로 끌면 남는 높이가 줄고 칸이 납작해진다 —
        그게 "달력 축소"다. 칸에 aspect-[6/7]을 걸면 폭이 높이를 정해 버려서 아무리 끌어도
        달력이 줄지 않고 잘리기만 한다.
        sm:부터는 패널이 고정 높이를 갖지 않으므로 예전대로 폭 기준 정사각형에 가깝게 둔다.
      */}
      <div
        ref={swipeRef}
        className="min-h-0 flex-1 touch-pan-y select-none overflow-hidden sm:flex-none"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={month}
            initial={reduceMotion ? false : { opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -32 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            role="grid"
            aria-label={t('gridLabel', { month: monthLabel })}
            className="grid h-full auto-rows-fr grid-cols-7 gap-x-1 gap-y-1.5 sm:h-auto sm:auto-rows-auto"
          >
        {days.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} role="gridcell" aria-hidden />;

          const dayTodos = todosByDate.get(date) ?? [];
          const dayEvents = eventsByDate.get(date) ?? [];
          const remaining = dayTodos.filter(t => t.status !== 'done').length;
          const isToday = date === today;
          const isSelected = date === selected;

          return (
            <button
              key={date}
              type="button"
              onClick={() => selectDate(date)}
              role="gridcell"
              aria-selected={isSelected}
              aria-current={isToday ? 'date' : undefined}
              /*
                칸 안의 숫자·배지·띠는 눈으로 보면 한 덩어리지만 읽어 주면 파편이 된다 —
                한 문장으로 합쳐서 들려 준다.
              */
              aria-label={describeDay(date, remaining, dayEvents)}
              className={cn(
                /*
                  overflow-hidden을 걸지 말 것 — 일정 띠는 시작 칸의 자식인데 폭이
                  calc(100% * n)으로 여러 칸에 걸쳐 있어서, 칸에서 잘라 내면 띠가 시작한 하루만
                  남고 나머지 날은 빈칸이 된다(기간 일정이 중간중간 끊겨 보인다).
                  세로로 넘치는 건 칸이 납작해질 때의 문제인데, 그건 점 모드로 따로 해결한다.
                */
                'flex min-h-0 flex-col items-stretch gap-1 rounded-xl border pt-1.5 pb-1 transition-colors sm:aspect-[6/7]',
                isSelected
                  ? 'border-accent bg-accent-soft text-ink'
                  : 'border-transparent text-ink active:bg-canvas-soft'
              )}
            >
              {/*
                날짜는 칸 한가운데 고정한다. 배지를 같은 흐름에 두면 할 일이 있는 날만
                숫자가 옆으로 밀려서 줄이 들쭉날쭉해진다 — 배지는 띄워서 옆에 붙인다.
              */}
              <span className="relative flex items-center justify-center px-1">
                <span className={cn('text-[13px] tabular-nums', isToday && 'font-bold')}>
                  {Number(date.slice(-2))}
                </span>
                {remaining > 0 && (
                  <span className="absolute right-0 top-1/2 grid min-w-[14px] -translate-y-1/2 rounded-full bg-canvas-soft px-1 text-[9px] leading-[14px] font-semibold text-ink-secondary">
                    {remaining}
                  </span>
                )}
              </span>

              {/*
                일정 띠.

                한 칸씩 그리지 않고 "세그먼트" 단위로 그린다 — 한 주 안에서 이어지는 구간
                하나가 span 하나다. 칸마다 그리면 두 가지가 어긋난다:
                모서리 둥글기를 칸 기준으로 판정해 기간 중간에서 둥글어지고,
                이름을 얹은 넓은 띠 아래에 칸별 띠가 겹쳐 그려진다.

                세그먼트는 주 경계와 달 경계에서 끊는다. 달 경계를 안 끊으면 말일 다음
                빈 칸(다음 달 자리) 위로 띠가 흘러간다.
              */}
              {/*
                띠는 보여 주기만 한다. 세그먼트가 여러 칸에 걸쳐 넓어져 있어서 클릭을 받으면,
                28일 위를 눌러도 그 세그먼트가 시작한 23일 칸이 선택된다 —
                띠는 시작 칸 button의 자식이기 때문이다. 클릭은 칸이 받아야 한다.
              */}
              {/*
                목록을 위로 끌어 칸이 납작해지면 띠 3줄(52px)이 안 들어간다 —
                그대로 두면 일정 많은 날이 잘려 보이므로 그 상태에서는 점으로만 표시한다.
                데스크톱은 패널이 높이를 뺏지 않으므로 compact 여부와 무관하게 늘 띠다(sm:flex).
              */}
              <span
                className={cn(
                  'pointer-events-none min-h-[52px] flex-col gap-[2px] sm:flex',
                  compact ? 'hidden' : 'flex'
                )}
              >
                {Array.from({ length: MAX_LANES }, (_, lane) => {
                  const event = dayEvents.find(e => laneOf.get(e.id) === lane);
                  if (!event) return <span key={lane} className="h-4" />;

                  // 세그먼트는 일정이 시작하거나, 주가 바뀌거나, 달이 바뀌는 칸에서 시작한다
                  const startsHere =
                    event.start_date === date || weekdayOf(date) === 0 || date === monthFirst;
                  // 그 밖의 칸은 이미 앞 세그먼트가 덮고 있다 — 줄 높이만 유지한다
                  if (!startsHere) return <span key={lane} className="h-4" />;

                  const segEnd = minDate(
                    event.end_date,
                    addDays(date, 6 - weekdayOf(date)),
                    monthLast
                  );
                  const span = daysBetween(date, segEnd) + 1;
                  const color = getEventColor(event.color);

                  // 잘린 쪽은 각지게 둔다 — 그래야 다음 줄/다음 주로 이어진다는 게 보인다
                  const roundStart = event.start_date === date;
                  const roundEnd = event.end_date === segEnd;

                  return (
                    <span
                      key={lane}
                      title={event.title}
                      className={cn(
                        'relative z-10 flex h-4 items-center overflow-hidden px-1.5',
                        roundStart && 'rounded-l-full',
                        roundEnd && 'rounded-r-full'
                      )}
                      style={{
                        background: color.bar,
                        color: color.ink,
                        // 칸 폭(100%) × 칸 수 + 칸 사이 간격
                        width: `calc(100% * ${span} + ${CELL_GAP_PX * (span - 1)}px)`,
                      }}
                    >
                      <span className="truncate text-[9px] leading-none font-medium">
                        {event.title}
                      </span>
                    </span>
                  );
                })}

                {dayEvents.some(e => (laneOf.get(e.id) ?? 0) >= MAX_LANES) && (
                  <span
                    className={cn(
                      'text-[9px] leading-none',
                      'text-ink-faint'
                    )}
                  >
                    +{dayEvents.filter(e => (laneOf.get(e.id) ?? 0) >= MAX_LANES).length}
                  </span>
                )}
              </span>

              {/*
                점 모드 — 위 띠 span과 자리를 맞바꾼다(칸이 납작할 때, 모바일에서만).
                제목·기간 정보 없이 색만 찍어서, 일정이 몰린 날도 칸 높이가 줄어든 만큼만 차지한다.
              */}
              {dayEvents.length > 0 && (
                <span
                  className={cn(
                    'pointer-events-none min-h-[10px] flex-wrap items-center justify-center gap-[3px] px-1 sm:hidden',
                    compact ? 'flex' : 'hidden'
                  )}
                >
                  {dayEvents.slice(0, MAX_DOTS).map(e => (
                    <span
                      key={e.id}
                      className="size-[5px] shrink-0 rounded-full"
                      style={{ background: getEventColor(e.color).bar }}
                    />
                  ))}
                  {dayEvents.length > MAX_DOTS && (
                    <span
                      className={cn(
                        'text-[8px] leading-none',
                        'text-ink-faint'
                      )}
                    >
                      +{dayEvents.length - MAX_DOTS}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/*
        날짜 목록 패널.

        높이를 px가 아니라 뷰포트 대비 비율(inline style)로 준다 — 주소창이 접혔다 펴지며
        dvh가 실시간으로 변하는데 px로 잡으면 그때마다 비율이 어긋난다.
        끄는 동안에는 transition을 끈다. 켜 두면 손가락을 300ms 뒤에서 따라온다.
        sm:부턴 h-auto라 인라인 높이가 무시되고 예전처럼 늘 펼쳐진 정적 섹션이 된다.
      */}
      <div
        style={{ height: `${panel.ratio * 100}%` }}
        className={cn(
          'flex shrink-0 flex-col overflow-hidden sm:!h-auto sm:overflow-visible',
          panel.dragging ? 'transition-none' : 'transition-[height] duration-300 ease-out'
        )}
      >
        {/*
          끌어서 크기를 바꾸는 손잡이. 누르기만 해도 다음 단계로 넘어간다 —
          작은 화면에서 몇 픽셀을 정확히 끄는 것보다 한 번 누르는 쪽이 빠를 때가 많다.
          touch-none이 없으면 브라우저가 이 세로 제스처를 페이지 스크롤로 먹어 버린다.
        */}
        <button
          type="button"
          aria-label={t('resizePanel')}
          {...panel.handleProps}
          className="grid h-6 shrink-0 touch-none place-items-center no-select sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-hairline-strong" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col border-t border-hairline pt-3 sm:mt-4 sm:min-h-0 sm:flex-none">
          <div className="flex shrink-0 items-center justify-between pb-2">
            <h2 className="text-caption font-semibold text-ink-secondary">
              {t('selectedSummary', {
                date: selected,
                events: selectedEvents.length,
                todos: selectedTodos.length,
              })}
            </h2>
            <Button size="sm" variant="outline" onClick={openNewEvent}>
              {t('newEvent')}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe sm:overflow-visible">

          {selectedEvents.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5">
              {selectedEvents.map(e => {
                const color = getEventColor(e.color);
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => openEvent(e)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left transition-colors active:bg-canvas-soft"
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ background: color.bar }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-ink">{e.title}</span>
                        <span className="block text-[11px] text-ink-faint">{formatRange(e)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedTodos.length === 0 && selectedEvents.length === 0 ? (
            <p className="py-6 text-center text-caption text-ink-faint">{t('emptyDay')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {selectedTodos.map(t => (
                <TodoRow
                  key={t.id}
                  todo={t}
                  owner={memberOf(t.owner_id)}
                  unknownLabel={tBoard('unknown')}
                  onToggle={() => toggleDone(t)}
                  busy={toggleStatus.isPending}
                />
              ))}
            </ul>
          )}

          {undated.length > 0 && (
            <div className="mt-5 border-t border-hairline pt-3">
              <h2 className="pb-2 text-caption font-semibold text-ink-secondary">
                {t('noDueDate', { count: undated.length })}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {undated.map(t => (
                  <TodoRow
                    key={t.id}
                    todo={t}
                    owner={memberOf(t.owner_id)}
                    unknownLabel={tBoard('unknown')}
                    onToggle={() => toggleDone(t)}
                  busy={toggleStatus.isPending}
                  />
                ))}
              </ul>
            </div>
          )}
          </div>
        </div>
      </div>

      <EventSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        orgId={orgId}
        event={editing}
        defaultDate={selected}
        canDelete={!editing || editing.created_by === currentUserId || isManager}
      />
    </div>
  );
}

function TodoRow({
  todo,
  owner,
  unknownLabel,
  onToggle,
  busy,
}: {
  todo: Todo;
  owner?: MemberSummary;
  unknownLabel: string;
  /** 체크하면 바로 완료 처리한다 — 남의 할 일이면 "대신 처리" 메모 모달로 이어진다 */
  onToggle: () => void;
  busy: boolean;
}) {
  const t = useTranslations('board');
  const done = todo.status === 'done';
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={done ? t('card.markUndone') : t('card.markDone')}
        className="shrink-0 transition-transform active:scale-90"
      >
        <span
          className={cn(
            'grid size-5 place-items-center rounded-md border transition-colors',
            done
              ? 'border-accent bg-accent text-accent-ink'
              : 'border-hairline-strong bg-surface sm:hover:border-ink-muted'
          )}
        >
          {done && (
            <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2.5 6.2 4.8 8.5 9.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
      <Avatar
        name={owner?.display_name ?? '?'}
        color={owner?.avatar_color}
        imageUrl={owner?.avatar_url}
        seed={todo.owner_id}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[14px]',
            done ? 'text-ink-faint line-through' : 'text-ink'
          )}
        >
          {todo.title}
        </span>
        <span className="block text-[11px] text-ink-faint">
          {owner?.display_name ?? unknownLabel}
        </span>
      </span>
    </li>
  );
}
