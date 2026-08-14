'use client';

import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createTodo } from '@/app/actions/todos';
import { showMsg } from '@/lib/toast';
import { cn, todayKST } from '@/lib/utils';
import { DuePicker } from '@/components/DuePicker';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Input } from '@/components/ui';
import type { MemberSummary, Todo } from '@/types/db';
import TodoCard from './TodoCard';

interface Props {
  member: MemberSummary;
  todos: Todo[];
  orgId: string;
  currentUserId: string;
  isManager: boolean;
  members: MemberSummary[];
  showDone: boolean;
  /** 대시보드 모드 — 가로 캐러셀이 아니라 세로로 쌓여서 페이지와 함께 스크롤된다 */
  stacked?: boolean;
  /** 지금 펼쳐 둔 할 일. 보드 전체에서 하나만 열린다 */
  openTodoId: string | null;
  onToggleOpen: (todoId: string) => void;
  onCreated: () => void;
  onHandoff: (todo: Todo) => void;
  className?: string;
}

const MemberColumn = forwardRef<HTMLElement, Props>(function MemberColumn(
  {
    member,
    todos,
    orgId,
    currentUserId,
    isManager,
    members,
    showDone,
    stacked = false,
    openTodoId,
    onToggleOpen,
    onCreated,
    onHandoff,
    className,
  },
  ref
) {
  const [title, setTitle] = useState('');
  // 마감은 오늘이 기본 — 대부분 오늘 할 일이고, 아니면 스테퍼로 하루씩 밀면 된다
  const [due, setDue] = useState<string | null>(todayKST());
  const [busy, setBusy] = useState(false);

  const isMine = member.user_id === currentUserId;

  /*
    급한 것부터 위로: 지난 마감 → 오늘 → 나중 → 마감 없음.
    마감이 같으면 나중에 넣은 것이 위로 온다(position은 새 할 일일수록 작다).
    완료한 일은 맨 아래에 최근 끝낸 순으로 쌓는다 — 방금 뭘 끝냈는지가 먼저 보여야 한다.
  */
  const { open, done, visible } = useMemo(() => {
    const openList = todos
      .filter(t => t.status !== 'done')
      .sort((a, b) => {
        if (a.due_date !== b.due_date) {
          // 마감 없는 건 급할 게 없으니 맨 뒤로
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date < b.due_date ? -1 : 1;
        }
        return a.position - b.position;
      });

    const doneList = todos
      .filter(t => t.status === 'done')
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

    return {
      open: openList,
      done: doneList,
      visible: showDone ? [...openList, ...doneList] : openList,
    };
  }, [todos, showDone]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    const res = await createTodo({
      orgId,
      title: value,
      ownerId: member.user_id,
      dueDate: due,
    });
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    setTitle('');
    setDue(todayKST());
    if (!isMine) showMsg(`${member.display_name}님 목록에 추가했어요.`, 'success');
    onCreated();
  }

  return (
    <section
      ref={ref}
      className={cn(
        'flex flex-col rounded-2xl border border-hairline bg-canvas-soft/60',
        // 캐러셀에서는 컬럼이 뷰포트 높이를 채우고 내부만 스크롤한다.
        // 대시보드에서는 내용만큼만 자라고 페이지가 통째로 스크롤된다.
        stacked ? 'w-full' : 'snap-col h-full shrink-0 overflow-hidden',
        isMine && 'border-hairline-strong bg-surface-alt',
        className
      )}
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2 no-select">
        <Avatar
          name={member.display_name}
          color={member.avatar_color}
          imageUrl={member.avatar_url}
          seed={member.user_id}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-ink sm:text-[14px]">
            {member.display_name}
            {isMine && <span className="ml-1 text-[12px] font-normal text-ink-faint">(나)</span>}
          </p>
          <p className="text-[12px] text-ink-faint">
            남은 일 {open.length}개{done.length > 0 && ` · 완료 ${done.length}`}
          </p>
        </div>
        {member.role !== 'member' && <Badge>{member.role === 'owner' ? '방장' : '관리자'}</Badge>}
      </header>

      <form onSubmit={add} className="flex flex-col gap-1.5 px-3 pb-2.5">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isMine ? '할 일 추가' : `${member.display_name}님에게 부탁하기`}
          maxLength={500}
          enterKeyHint="done"
          className="h-11 sm:h-9"
        />
        {title.trim() && (
          <>
            {/* 컬럼 패딩까지 스크롤 영역을 넓혀 가장자리에서 잘린 것처럼 보이지 않게 한다 */}
            <DuePicker value={due} onChange={setDue} className="-mx-3 px-3" />
            <Button type="submit" className="h-11 sm:h-9" disabled={busy}>
              추가
            </Button>
          </>
        )}
      </form>

      <ul
        className={cn(
          'flex flex-1 flex-col gap-2 px-3 pb-3',
          !stacked && 'overflow-y-auto overscroll-contain'
        )}
      >
        <AnimatePresence initial={false}>
          {visible.map(todo => (
            <TodoCard
              key={todo.id}
              todo={todo}
              isMine={isMine}
              members={members}
              currentUserId={currentUserId}
              isManager={isManager}
              open={openTodoId === todo.id}
              onToggleOpen={() => onToggleOpen(todo.id)}
              onHandoff={onHandoff}
            />
          ))}
        </AnimatePresence>

        {visible.length === 0 && (
          <li className="rounded-xl border border-dashed border-hairline px-3 py-8 text-center text-caption text-ink-faint">
            {isMine ? '할 일이 비어 있어요' : '남은 할 일이 없어요'}
          </li>
        )}
      </ul>
    </section>
  );
});

export default MemberColumn;
