'use client';

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { addDays, cn, todayKST } from '@/lib/utils';
import type { MemberSummary, Todo } from '@/types/db';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

/**
 * 조직 전체 할 일을 마감일 기준으로 훑는 뷰.
 * 보드가 "누가 무엇을 들고 있나"라면 달력은 "언제 몰려 있나"를 본다.
 */
export function CalendarView({
  todos,
  members,
  showDone,
}: {
  todos: Todo[];
  members: MemberSummary[];
  showDone: boolean;
}) {
  const today = todayKST();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);

  const visible = useMemo(
    () => (showDone ? todos : todos.filter(t => t.status !== 'done')),
    [todos, showDone]
  );

  /** 날짜 → 그 날 마감인 할 일. 마감이 없는 건 달력에 설 자리가 없다 */
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    visible.forEach(t => {
      if (!t.due_date) return;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    });
    return map;
  }, [visible]);

  const memberOf = useMemo(() => {
    const map = new Map(members.map(m => [m.user_id, m]));
    return (id: string) => map.get(id);
  }, [members]);

  const days = monthGrid(month);
  const selectedTodos = byDate.get(selected) ?? [];
  const undated = visible.filter(t => !t.due_date);
  const [year, monthNumber] = month.split('-');

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

      <div className="grid grid-cols-7 gap-1">
        {days.map((date, i) => {
          if (!date) return <span key={`blank-${i}`} />;

          const dayTodos = byDate.get(date) ?? [];
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
                'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] tabular-nums transition-colors',
                isSelected ? 'bg-accent text-accent-ink' : 'text-ink active:bg-canvas-soft',
                !isSelected && isToday && 'font-bold ring-1 ring-hairline-strong'
              )}
            >
              {Number(date.slice(-2))}
              {/* 개수만 찍는다 — 제목까지 넣으면 칸이 감당하지 못한다 */}
              {dayTodos.length > 0 && (
                <span
                  className={cn(
                    'grid min-w-[16px] rounded-full px-1 text-[10px] font-semibold',
                    isSelected
                      ? 'bg-accent-ink/25 text-accent-ink'
                      : remaining > 0
                        ? 'bg-canvas-soft text-ink-secondary'
                        : 'text-ink-faint'
                  )}
                >
                  {remaining > 0 ? remaining : '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="mt-4 border-t border-hairline pt-3">
        <h2 className="pb-2 text-caption font-semibold text-ink-secondary">
          {selected} · {selectedTodos.length}건
        </h2>
        {selectedTodos.length === 0 ? (
          <p className="py-6 text-center text-caption text-ink-faint">이 날 마감인 할 일이 없어요.</p>
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
