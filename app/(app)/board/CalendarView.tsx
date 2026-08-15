'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { useHorizontalSwipe } from '@/hooks/useHorizontalSwipe';
import { useOutsideClick } from '@/hooks/useOutsideClick';
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
  /** 날짜를 탭하기 전엔 목록 패널을 접어 두고 달력을 화면 전체로 쓴다 (모바일 전용 — sm:부턴 CSS가 무시한다) */
  const [panelOpen, setPanelOpen] = useState(false);
  /** 달력 전체(격자 + 패널) 바깥의 빈 화면을 누르면 패널을 닫는다. 격자 안의 다른 날짜를
   *  누르는 것까지 "바깥 클릭"으로 잡으면, mousedown이 먼저 패널을 닫고 뒤이은 onClick의
   *  selectDate가 그 시점의 panelOpen(=false)을 보고 토글을 오판해 다시 열려버린다 —
   *  그래서 ref는 격자까지 포함한 컴포넌트 전체 루트에 건다. */
  const rootRef = useRef<HTMLDivElement>(null);
  useOutsideClick(rootRef, () => setPanelOpen(false), panelOpen);
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

  /** 날짜를 탭하면 목록 패널이 뜬다. 이미 열려 있는 그 날짜를 다시 탭하면 접힌다(토글) */
  function selectDate(date: string) {
    if (panelOpen && date === selected) {
      setPanelOpen(false);
      return;
    }
    setSelected(date);
    setPanelOpen(true);
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
        칸 높이는 auto-rows-fr로 남은 화면을 억지로 채우지 않는다 — 그러면 달이 5주짜리든
        6주짜리든 칸이 뷰포트 높이에 맞춰 늘어나서 정사각형을 한참 넘는 길쭉한 직사각형이 된다.
        대신 아래 각 칸에 aspect-[6/7]을 줘서 폭 기준으로 스스로 높이를 정하게 한다 —
        칸이 촘촘히 쌓여도 달력 전체 높이가 늘 비슷하게 나온다.
      */}
      <div ref={swipeRef} className="touch-pan-y select-none overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={month}
            initial={reduceMotion ? false : { opacity: 0, x: direction * 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -32 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 0.61, 0.36, 1] }}
            role="grid"
            aria-label={t('gridLabel', { month: monthLabel })}
            className="grid grid-cols-7 gap-x-1 gap-y-1.5"
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
                'flex aspect-[6/7] flex-col items-stretch gap-1 rounded-xl border pt-1.5 pb-1 transition-colors',
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
                calendar-viewport가 패널 때문에 줄어든 동안(panelOpen, 모바일에서만) 칸 높이가
                띠 3줄(52px)보다 좁아질 수 있다 — 그대로 두면 일정 많은 날이 잘려 보인다.
                그 상태에서는 띠 대신 점으로만 표시한다. 데스크톱은 패널이 실제로 안 줄어들어서
                sm:부터 다시 띠로 되돌린다(compact 여부와 무관하게 항상 sm:flex).
              */}
              <span
                className={cn(
                  'pointer-events-none min-h-[52px] flex-col gap-[2px] sm:flex',
                  panelOpen ? 'hidden' : 'flex'
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
                점 모드 — 위 띠 span과 자리를 맞바꾼다(panelOpen이면 모바일에서만 보임).
                제목·기간 정보 없이 색만 찍어서, 일정이 몰린 날도 칸 높이가 줄어든 만큼만 차지한다.
              */}
              {dayEvents.length > 0 && (
                <span
                  className={cn(
                    'pointer-events-none min-h-[10px] flex-wrap items-center justify-center gap-[3px] px-1 sm:hidden',
                    panelOpen ? 'flex' : 'hidden'
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
        날짜 목록 패널. 접혀 있으면(panelOpen=false) 높이 0으로 그냥 사라져서 위 달력이
        calendar-viewport 전체를 차지한다 — 화면 절반 정도로 펴지는 건 h-[50dvh] 하나로 끝난다.
        sm:부턴 h-auto로 되돌려 원래처럼 늘 펼쳐진 정적 섹션으로 되돌아간다(패널 개념 자체가 무의미).
      */}
      <div
        className={cn(
          'overflow-hidden transition-[height] duration-300 ease-out',
          panelOpen ? 'h-[50dvh]' : 'h-0',
          'sm:h-auto sm:overflow-visible sm:transition-none'
        )}
      >
        <div className="mt-4 h-full overflow-y-auto border-t border-hairline pt-3 pb-safe sm:h-auto sm:overflow-visible">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-caption font-semibold text-ink-secondary">
              {t('selectedSummary', {
                date: selected,
                events: selectedEvents.length,
                todos: selectedTodos.length,
              })}
            </h2>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={openNewEvent}>
                {t('newEvent')}
              </Button>
              {/* 데스크톱은 패널이 늘 펴져 있어 닫을 필요가 없다 */}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label={t('closeDay')}
                className="grid size-8 shrink-0 place-items-center rounded-lg text-[15px] text-ink-muted active:bg-canvas-soft sm:hidden"
              >
                ✕
              </button>
            </div>
          </div>

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
