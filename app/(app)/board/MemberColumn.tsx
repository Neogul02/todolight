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
  members: MemberSummary[];
  showDone: boolean;
  onMutated: () => void;
  onHandoff: (todo: Todo) => void;
  className?: string;
}

const MemberColumn = forwardRef<HTMLElement, Props>(function MemberColumn(
  { member, todos, orgId, currentUserId, members, showDone, onMutated, onHandoff, className },
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
        'snap-col flex h-full shrink-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas-soft/60',
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

      {/* 컬럼 내부만 세로 스크롤 — 페이지 전체가 늘어나면 탭바가 밀린다 */}
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 pb-3">
        <AnimatePresence initial={false}>
          {visible.map(todo => (
            <TodoCard
              key={todo.id}
              todo={todo}
              isMine={isMine}
              members={members}
              currentUserId={currentUserId}
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
