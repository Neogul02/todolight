'use client';

import { useMemo, useState } from 'react';
import { useOrgMembers, useOrgTodos } from '@/hooks/useOrgBoard';
import { Avatar } from '@/components/Avatar';
import { BottomSheet } from '@/components/BottomSheet';
import { Spinner } from '@/components/ui';
import { addDays, cn, todayKST } from '@/lib/utils';
import type { Todo } from '@/types/db';

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
  const shifted = new Date(Date.UTC(y, m - 1 + delta, 1));
  return shifted.toISOString().slice(0, 7);
}

/**
 * 조직 전체 할 일을 마감일 기준으로 훑는 달력.
 * 보드는 "누가 무엇을 들고 있나"를 보는 화면이고, 이건 "언제 몰려 있나"를 보는 화면이다.
 */
export function CalendarSheet({
  open,
  onClose,
  orgId,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string | null;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="달력" className="sm:max-w-[560px]">
      {orgId ? <CalendarBody orgId={orgId} /> : <p className="text-caption text-ink-muted">조직을 먼저 만들어 주세요.</p>}
    </BottomSheet>
  );
}

function CalendarBody({ orgId }: { orgId: string }) {
  const todos = useOrgTodos(orgId);
  const members = useOrgMembers(orgId);

  const today = todayKST();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(today);

  /** 날짜 → 그 날 마감인 할 일. 마감 없는 건 달력에 설 자리가 없다 */
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    (todos.data ?? []).forEach(t => {
      if (!t.due_date) return;
      const list = map.get(t.due_date) ?? [];
      list.push(t);
      map.set(t.due_date, list);
    });
    return map;
  }, [todos.data]);

  const memberOf = useMemo(() => {
    const map = new Map((members.data ?? []).map(m => [m.user_id, m]));
    return (id: string) => map.get(id);
  }, [members.data]);

  if (todos.isLoading || members.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-ink-muted">
        <Spinner /> 불러오는 중…
      </div>
    );
  }

  const days = monthGrid(month);
  const selectedTodos = selected ? (byDate.get(selected) ?? []) : [];
  const [year, monthNumber] = month.split('-');

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <button
          type="button"
          onClick={() => setMonth(m => shiftMonth(m, -1))}
          aria-label="이전 달"
          className="grid size-10 place-items-center rounded-xl text-ink-muted active:bg-canvas-soft"
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
          className="grid size-10 place-items-center rounded-xl text-ink-muted active:bg-canvas-soft"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 pb-1">
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
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] tabular-nums transition-colors',
                isSelected ? 'bg-accent text-accent-ink' : 'text-ink active:bg-canvas-soft',
                !isSelected && isToday && 'font-bold'
              )}
            >
              {Number(date.slice(-2))}
              {/* 남은 일이 있는 날만 점을 찍는다 — 숫자를 다 적으면 격자가 시끄럽다 */}
              {dayTodos.length > 0 && (
                <span
                  className={cn(
                    'grid min-w-[16px] rounded-full px-1 text-[10px] font-semibold',
                    isSelected
                      ? 'bg-accent-ink/20 text-accent-ink'
                      : remaining > 0
                        ? 'bg-canvas-soft text-ink-secondary'
                        : 'bg-transparent text-ink-faint'
                  )}
                >
                  {remaining > 0 ? remaining : '✓'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-hairline pt-3">
        <p className="pb-2 text-caption font-semibold text-ink-secondary">
          {selected ?? '날짜를 골라 주세요'}
          {selected && ` · ${selectedTodos.length}건`}
        </p>

        {selectedTodos.length === 0 ? (
          <p className="py-4 text-center text-caption text-ink-faint">이 날 마감인 할 일이 없어요.</p>
        ) : (
          <ul className="flex max-h-[40dvh] flex-col gap-1.5 overflow-y-auto overscroll-contain">
            {selectedTodos.map(t => {
              const owner = memberOf(t.owner_id);
              const done = t.status === 'done';
              return (
                <li
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface px-3 py-2.5"
                >
                  <Avatar
                    name={owner?.display_name ?? '?'}
                    color={owner?.avatar_color}
                    imageUrl={owner?.avatar_url}
                    seed={t.owner_id}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-[14px]',
                        done ? 'text-ink-faint line-through' : 'text-ink'
                      )}
                    >
                      {t.title}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {owner?.display_name ?? '알 수 없음'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
