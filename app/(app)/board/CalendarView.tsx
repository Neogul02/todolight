'use client';

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui';
import { getEventColor } from '@/lib/event-colors';
import { useOrgEvents } from '@/hooks/useOrgEvents';
import { addDays, cn, todayKST } from '@/lib/utils';
import type { MemberSummary, OrgEvent, Todo } from '@/types/db';
import { EventSheet } from './EventSheet';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 한 칸에 띠를 무한히 쌓을 수는 없다. 넘치면 개수만 알린다 */
const MAX_BARS = 3;

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
}: {
  orgId: string | null;
  todos: Todo[];
  members: MemberSummary[];
  showDone: boolean;
  currentUserId: string;
  isManager: boolean;
}) {
  const today = todayKST();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [editing, setEditing] = useState<OrgEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const events = useOrgEvents(orgId);

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

  const memberOf = useMemo(() => {
    const map = new Map(members.map(m => [m.user_id, m]));
    return (id: string) => map.get(id);
  }, [members]);

  const days = monthGrid(month);
  const selectedTodos = todosByDate.get(selected) ?? [];
  const selectedEvents = eventsByDate.get(selected) ?? [];
  const undated = visible.filter(t => !t.due_date);
  const [year, monthNumber] = month.split('-');

  function openNewEvent() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEvent(event: OrgEvent) {
    setEditing(event);
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-3 pb-safe sm:px-4">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          onClick={() => setMonth(m => shiftMonth(m, -1))}
          aria-label="이전 달"
          className="grid size-10 place-items-center rounded-xl text-[18px] text-ink-muted active:bg-canvas-soft"
        >
          ‹
        </button>
        <p className="text-title tabular-nums text-ink">
          {year}년 {Number(monthNumber)}월
        </p>
        <button
          type="button"
          onClick={() => setMonth(m => shiftMonth(m, 1))}
          aria-label="다음 달"
          className="grid size-10 place-items-center rounded-xl text-[18px] text-ink-muted active:bg-canvas-soft"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS.map(w => (
          <span key={w} className="py-1 text-center text-[11px] font-medium text-ink-faint">
            {w}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-x-1 gap-y-1.5">
        {days.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;

          const dayTodos = todosByDate.get(date) ?? [];
          const dayEvents = eventsByDate.get(date) ?? [];
          const remaining = dayTodos.filter(t => t.status !== 'done').length;
          const isToday = date === today;
          const isSelected = date === selected;

          return (
            <button
              key={date}
              type="button"
              onClick={() => setSelected(date)}
              aria-pressed={isSelected}
              className={cn(
                'flex flex-col items-stretch gap-1 rounded-xl pt-1.5 pb-1 transition-colors',
                isSelected ? 'bg-accent text-accent-ink' : 'text-ink active:bg-canvas-soft'
              )}
            >
              {/*
                날짜는 칸 한가운데 고정한다. 배지를 같은 흐름에 두면 할 일이 있는 날만
                숫자가 옆으로 밀려서 줄이 들쭉날쭉해진다 — 배지는 띄워서 옆에 붙인다.
              */}
              <span className="relative flex items-center justify-center px-1">
                <span
                  className={cn('text-[13px] tabular-nums', !isSelected && isToday && 'font-bold')}
                >
                  {Number(date.slice(-2))}
                </span>
                {remaining > 0 && (
                  <span
                    className={cn(
                      'absolute right-0 top-1/2 grid min-w-[14px] -translate-y-1/2 rounded-full px-1 text-[9px] leading-[14px] font-semibold',
                      isSelected
                        ? 'bg-accent-ink/25 text-accent-ink'
                        : 'bg-canvas-soft text-ink-secondary'
                    )}
                  >
                    {remaining}
                  </span>
                )}
              </span>

              {/*
                일정 띠. 칸 사이 간격(gap-x-1)만큼 좌우로 넓혀서 기간이 끊기지 않고 이어져 보이게 한다.
                시작일·종료일에서만 모서리를 둥글게 해 어디서 시작하고 끝나는지 드러낸다.
              */}
              <span className="flex min-h-[18px] flex-col gap-[3px]">
                {dayEvents.slice(0, MAX_BARS).map(e => {
                  const color = getEventColor(e.color);
                  const isStart = e.start_date === date;
                  const isEnd = e.end_date === date;
                  return (
                    <span
                      key={e.id}
                      title={e.title}
                      className={cn(
                        'h-[5px]',
                        isStart ? 'ml-0.5 rounded-l-full' : '-ml-1',
                        isEnd ? 'mr-0.5 rounded-r-full' : '-mr-1'
                      )}
                      style={{ background: color.bar }}
                    />
                  );
                })}
                {dayEvents.length > MAX_BARS && (
                  <span
                    className={cn(
                      'text-[9px] leading-none',
                      isSelected ? 'text-accent-ink/70' : 'text-ink-faint'
                    )}
                  >
                    +{dayEvents.length - MAX_BARS}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <section className="mt-4 border-t border-hairline pt-3">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-caption font-semibold text-ink-secondary">
            {selected} · 일정 {selectedEvents.length} · 할 일 {selectedTodos.length}
          </h2>
          <Button size="sm" variant="outline" onClick={openNewEvent}>
            + 일정
          </Button>
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
          <p className="py-6 text-center text-caption text-ink-faint">이 날은 비어 있어요.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {selectedTodos.map(t => (
              <TodoRow key={t.id} todo={t} owner={memberOf(t.owner_id)} />
            ))}
          </ul>
        )}
      </section>

      {undated.length > 0 && (
        <section className="mt-5 border-t border-hairline pt-3">
          <h2 className="pb-2 text-caption font-semibold text-ink-secondary">
            마감 없음 · {undated.length}건
          </h2>
          <ul className="flex flex-col gap-1.5">
            {undated.map(t => (
              <TodoRow key={t.id} todo={t} owner={memberOf(t.owner_id)} />
            ))}
          </ul>
        </section>
      )}

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

function TodoRow({ todo, owner }: { todo: Todo; owner?: MemberSummary }) {
  const done = todo.status === 'done';
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5">
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
          {owner?.display_name ?? '알 수 없음'}
        </span>
      </span>
    </li>
  );
}
