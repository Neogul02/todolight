'use client';

import { forwardRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { createTodo } from '@/app/actions/todos';
import { showMsg } from '@/lib/toast';
import { cn } from '@/lib/utils';
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
  onMutated: () => void;
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
    onMutated,
    onHandoff,
    className,
  },
  ref
) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  const isMine = member.user_id === currentUserId;
  const open = todos.filter(t => t.status !== 'done');
  const done = todos.filter(t => t.status === 'done');
  const visible = showDone ? [...open, ...done] : open;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value || busy) return;
    setBusy(true);
    const res = await createTodo({
      orgId,
      title: value,
      ownerId: member.user_id,
      dueDate: due || null,
    });
    setBusy(false);
    if (!res.success) {
      showMsg(res.error, 'error');
      return;
    }
    setTitle('');
    setDue('');
    if (!isMine) showMsg(`${member.display_name}님 목록에 추가했습니다.`, 'success');
    onMutated();
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
        <Avatar name={member.display_name} color={member.avatar_color} seed={member.user_id} />
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
          <div className="flex gap-1.5">
            <Input
              type="date"
              value={due}
              onChange={e => setDue(e.target.value)}
              className="h-11 flex-1 sm:h-9"
            />
            <Button type="submit" className="h-11 px-4 sm:h-9" disabled={busy}>
              추가
            </Button>
          </div>
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
              onMutated={onMutated}
              onHandoff={onHandoff}
            />
          ))}
        </AnimatePresence>

        {visible.length === 0 && (
          <li className="rounded-xl border border-dashed border-hairline px-3 py-8 text-center text-caption text-ink-faint">
            {isMine ? '할 일이 비어 있습니다.' : '남은 할 일이 없습니다.'}
          </li>
        )}
      </ul>
    </section>
  );
});

export default MemberColumn;
