'use client';

import { forwardRef, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { showMsg } from '@/lib/toast';
import { cn, todayKST } from '@/lib/utils';
import { DuePicker } from '@/components/DuePicker';
import { Avatar } from '@/components/Avatar';
import { Badge, Button, Input } from '@/components/ui';
import type { MemberSummary, Todo } from '@/types/db';
import type { TypingUser } from '@/hooks/useTypingPresence';
import type { FocusUser } from '@/hooks/useFocusPresence';
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
  onHandoff: (todo: Todo) => void;
  /** 할 일 id별 입력 중인 다른 멤버 목록 */
  typingByTodoId: Map<string, TypingUser[]>;
  onTyping: (todoId: string, field: 'title' | 'note') => void;
  /** 할 일 id별로 지금 카드를 펼쳐서 보고 있는 다른 멤버 목록 */
  focusByTodoId: Map<string, FocusUser[]>;
  className?: string;
}

/** 완료 항목을 접기 전에 보여 줄 개수. 최근 끝낸 몇 개만 보이면 충분하다 */
const VISIBLE_DONE = 3;

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
    onHandoff,
    typingByTodoId,
    onTyping,
    focusByTodoId,
    className,
  },
  ref
) {
  const t = useTranslations('board.column');
  const tRole = useTranslations('appshell');
  const tToast = useTranslations('toast');
  const [title, setTitle] = useState('');
  const [showAllDone, setShowAllDone] = useState(false);
  // 마감은 오늘이 기본 — 대부분 오늘 할 일이고, 아니면 스테퍼로 하루씩 밀면 된다
  const [due, setDue] = useState<string | null>(todayKST());
  const { create } = useTodoMutations(orgId);

  const isMine = member.user_id === currentUserId;

  /*
    급한 것부터 위로: 지난 마감 → 오늘 → 나중 → 마감 없음.
    마감이 같으면 나중에 넣은 것이 위로 온다(position은 새 할 일일수록 작다).
    완료한 일은 맨 아래에 최근 끝낸 순으로 쌓는다 — 방금 뭘 끝냈는지가 먼저 보여야 한다.
  */
  const { open, done } = useMemo(() => {
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

    return { open: openList, done: doneList };
  }, [todos]);

  /*
    완료가 쌓이면 컬럼을 통째로 잠식해서 남은 일이 스크롤 밖으로 밀린다.
    최근 끝낸 몇 개만 두고 나머지는 접는다 — 지우는 게 아니라 접는 것이라 언제든 펼 수 있다.
  */
  const hiddenDone = showDone && !showAllDone ? Math.max(0, done.length - VISIBLE_DONE) : 0;
  const visible = showDone
    ? [...open, ...(showAllDone ? done : done.slice(0, VISIBLE_DONE))]
    : open;

  /*
    입력칸은 서버를 기다리지 않고 바로 비운다. 카드는 낙관적으로 이미 컬럼 맨 위에 있고,
    실패하면 useTodoMutations가 되돌리면서 이유를 토스트로 알린다 —
    왕복 300~700ms 동안 손이 멈춰 있던 게 "렉"의 정체였다.
  */
  function add(e: React.FormEvent) {
    e.preventDefault();
    const value = title.trim();
    if (!value) return;

    const now = new Date().toISOString();
    create.mutate({
      orgId,
      todo: {
        id: crypto.randomUUID(),
        org_id: orgId,
        owner_id: member.user_id,
        title: value,
        status: 'todo',
        due_date: due,
        // 서버도 "맨 위 position - 1"을 쓴다. 정확한 값은 응답·실시간으로 곧 맞춰지고,
        // 그 전까지는 어느 카드보다 작기만 하면 맨 위에 놓인다.
        position: Math.min(0, ...todos.map(t => t.position)) - 1,
        created_by: currentUserId,
        handled_by: null,
        completed_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        notes: [],
        participant_ids: [],
      },
    });

    setTitle('');
    setDue(todayKST());
    if (!isMine) showMsg(tToast('addedToMemberList', { name: member.display_name }), 'success');
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
            {isMine && <span className="ml-1 text-[12px] font-normal text-ink-faint">{t('me')}</span>}
          </p>
          <p className="text-[12px] text-ink-faint">
            {t('summaryOpen', { count: open.length })}
            {done.length > 0 && t('summaryDone', { count: done.length })}
          </p>
        </div>
        {member.role !== 'member' && (
          <Badge>{member.role === 'owner' ? tRole('roleOwner') : tRole('roleAdmin')}</Badge>
        )}
      </header>

      <form onSubmit={add} className="flex flex-col gap-1.5 px-3 pb-2.5">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={isMine ? t('addPlaceholderMine') : t('addPlaceholderOther', { name: member.display_name })}
          maxLength={500}
          enterKeyHint="done"
          className="h-11 sm:h-9"
        />
        {title.trim() && (
          <>
            {/* 컬럼 패딩까지 스크롤 영역을 넓혀 가장자리에서 잘린 것처럼 보이지 않게 한다 */}
            <DuePicker value={due} onChange={setDue} className="-mx-3 px-3" />
            <Button type="submit" className="h-11 sm:h-9">
              {t('addButton')}
            </Button>
          </>
        )}
      </form>

      {/*
        컬럼은 화면 끝까지 내려가고 하단 탭바(알약)가 그 위에 뜬다 —
        마지막 카드가 알약 밑에 영영 갇히지 않도록 스크롤 영역 아래를 그만큼 비운다.
        쌓기(대시보드)일 때는 이 ul이 스크롤 컨테이너가 아니라 격자가 대신 비운다.
      */}
      <ul
        className={cn(
          'flex flex-1 flex-col gap-2 px-3',
          stacked ? 'pb-3' : 'overflow-y-auto overscroll-contain pb-tabbar'
        )}
      >
        <AnimatePresence initial={false}>
          {visible.map(todo => (
            <TodoCard
              key={todo.id}
              todo={todo}
              // 컬럼 소속(isMine)과 실제 소유권은 다르다 — 같이하기로 참여한 할 일은
              // 내 컬럼에 뜨지만 주인은 따로 있다. 여길 컬럼 기준으로 두면 참여자가
              // 남의 할 일을 수정·삭제할 수 있는 권한 버그가 생긴다.
              isMine={todo.owner_id === currentUserId}
              members={members}
              currentUserId={currentUserId}
              isManager={isManager}
              open={openTodoId === todo.id}
              onToggleOpen={() => onToggleOpen(todo.id)}
              onHandoff={onHandoff}
              typingUsers={typingByTodoId.get(todo.id)}
              onTyping={onTyping}
              focusUsers={focusByTodoId.get(todo.id)}
            />
          ))}
        </AnimatePresence>

        {hiddenDone > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowAllDone(true)}
              className="w-full rounded-xl border border-dashed border-hairline py-2 text-caption text-ink-muted transition-colors active:bg-canvas-soft"
            >
              {t('showMoreDone', { count: hiddenDone })}
            </button>
          </li>
        )}

        {showDone && showAllDone && done.length > VISIBLE_DONE && (
          <li>
            <button
              type="button"
              onClick={() => setShowAllDone(false)}
              className="w-full rounded-xl border border-dashed border-hairline py-2 text-caption text-ink-muted transition-colors active:bg-canvas-soft"
            >
              {t('collapseDone')}
            </button>
          </li>
        )}

        {visible.length === 0 && (
          <li className="rounded-xl border border-dashed border-hairline px-3 py-8 text-center text-caption text-ink-faint">
            {isMine ? t('emptyMine') : t('emptyOther')}
          </li>
        )}
      </ul>
    </section>
  );
});

export default MemberColumn;
