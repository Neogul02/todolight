'use client';

import { forwardRef, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, Reorder } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useTodoMutations } from '@/hooks/useTodoMutations';
import { showMsg } from '@/lib/toast';
import { cn, todayKST } from '@/lib/utils';
import { DuePill } from '@/components/DuePill';
import { Avatar } from '@/components/Avatar';
import { Badge, Input } from '@/components/ui';
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
  // 마감은 오늘이 기본 — 대부분 오늘 할 일이다. 기본값이 무엇인지는 알약에 늘 적혀 있다.
  const [due, setDue] = useState<string | null>(todayKST());
  const [dueOpen, setDueOpen] = useState(false);
  const { create, reorder } = useTodoMutations(orgId);

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
    기본 정렬은 날짜순(open)이지만, 꾹 눌러 드래그하면 그 순간만은 이 손끝 순서가
    진실이다 — 서버 값을 매 프레임 반영하면 드래그 중에 카드가 도로 튀어 돌아간다.
    open의 id 구성이 바뀌면(새로 추가·삭제·마감일 변경) 그때만 다시 맞춘다.
  */
  const [order, setOrder] = useState<string[]>(() => open.map(t => t.id));
  useEffect(() => {
    setOrder(open.map(t => t.id));
  }, [open]);

  const todoById = useMemo(() => new Map(open.map(t => [t.id, t])), [open]);
  const orderedOpen = useMemo(
    () => order.map(id => todoById.get(id)).filter((t): t is Todo => Boolean(t)),
    [order, todoById]
  );

  /*
    프레이머가 드래그 중 계산한 새 순서를 그대로 받아들이지 않는다 — 같은 마감일 그룹
    안에서 자리 하나만 바뀐 경우에만 받아들인다. 두 자리 이상이 한꺼번에 바뀌었거나
    마감일이 다른 두 항목이 자리를 바꾸려 하면 무시해서, 드래그가 그 마감일 그룹의
    경계를 넘지 못하게 막는다(넘어가려 해도 손끝을 따라 잠깐 움직일 뿐 자리는 안 바뀐다).
  */
  function handleReorder(newOrder: string[]) {
    const changed: number[] = [];
    for (let i = 0; i < newOrder.length; i += 1) {
      if (newOrder[i] !== order[i]) changed.push(i);
    }
    if (changed.length !== 2) return;
    const [i, j] = changed;
    if (todoById.get(newOrder[i])?.due_date !== todoById.get(newOrder[j])?.due_date) return;
    setOrder(newOrder);
  }

  /** 손을 놓았을 때 — 새 이웃 두 개의 position 평균으로 서버에 반영한다 */
  function commitReorder(todoId: string) {
    const idx = order.indexOf(todoId);
    if (idx === -1) return;
    const prevPos = order[idx - 1] ? todoById.get(order[idx - 1])?.position : undefined;
    const nextPos = order[idx + 1] ? todoById.get(order[idx + 1])?.position : undefined;
    if (prevPos === undefined && nextPos === undefined) return;
    const position =
      prevPos === undefined ? nextPos! - 1 : nextPos === undefined ? prevPos + 1 : (prevPos + nextPos) / 2;
    if (todoById.get(todoId)?.position === position) return;
    reorder.mutate({ todoId, position });
  }

  /*
    완료가 쌓이면 컬럼을 통째로 잠식해서 남은 일이 스크롤 밖으로 밀린다.
    최근 끝낸 몇 개만 두고 나머지는 접는다 — 지우는 게 아니라 접는 것이라 언제든 펼 수 있다.
  */
  const hiddenDone = showDone && !showAllDone ? Math.max(0, done.length - VISIBLE_DONE) : 0;
  const visible = showDone
    ? [...orderedOpen, ...(showAllDone ? done : done.slice(0, VISIBLE_DONE))]
    : orderedOpen;

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
    setDueOpen(false);
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

      {/*
        추가 칸은 **높이가 변하지 않는다.**

        예전에는 글자를 넣는 순간 날짜 레일과 [추가] 버튼이 아래에서 솟아나 목록을 100px쯤
        밀어냈다. 한 글자 치는 동작에 화면이 그만큼 움직이니 방금 보던 카드를 매번 다시
        찾아야 했다. 지금은 보내기 버튼이 입력칸 **안에** 있어서 글자가 있든 없든 줄 수가
        같고, 마감일은 그 아래 알약 한 줄이 늘 지키고 있다(눌렀을 때만 레일이 열린다).

        추가하는 데 드는 손은 "치고 Enter" 한 번이다. 날짜를 바꿀 때만 두 번 더 든다.
      */}
      <form onSubmit={add} className="flex flex-col gap-1.5 px-3 pb-2.5">
        <div className="relative">
          <Input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={isMine ? t('addPlaceholderMine') : t('addPlaceholderOther', { name: member.display_name })}
            maxLength={500}
            enterKeyHint="done"
            className="h-11 pr-11 sm:h-9 sm:pr-10"
          />
          {/*
            비어 있을 때도 자리를 지킨다(숨기면 다시 줄 높이가 흔들린다).
            대신 눌러도 아무 일이 없다는 걸 흐린 색과 disabled로 알린다.
          */}
          <button
            type="submit"
            disabled={!title.trim()}
            aria-label={t('addButton')}
            className={cn(
              'absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg sm:size-7',
              'transition-[background-color,color,transform] active:scale-90',
              title.trim()
                ? 'bg-accent text-accent-ink'
                : 'bg-transparent text-ink-faint'
            )}
          >
            <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 13V3.5M8 3.5 4 7.5M8 3.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <DuePill
          value={due}
          onChange={setDue}
          open={dueOpen}
          onOpenChange={setDueOpen}
          railClassName="-mx-3 px-3"
        />
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
        {/*
          Reorder.Group은 이 안의 Reorder.Item(드래그 가능한 카드)에게 컨텍스트만 대 준다 —
          AnimatePresence의 직접 자식은 여전히 TodoCard 하나하나라서, 할 일을 지울 때의
          퇴장 애니메이션이 그대로 유지된다. 완료 항목은 Reorder.Item이 아니므로
          values에 넣지 않는다(대시보드에서는 draggable 자체를 꺼서 아예 관여하지 않는다).
        */}
        <Reorder.Group as="div" axis="y" className="contents" values={order} onReorder={handleReorder}>
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
                draggable={!stacked && todo.status !== 'done'}
                onReorderCommit={() => commitReorder(todo.id)}
              />
            ))}
          </AnimatePresence>
        </Reorder.Group>

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
