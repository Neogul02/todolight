'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import {
  boardKeys,
  useBoardRealtime,
  useOrgMembers,
  useOrgPresence,
  useOrgTodos,
} from '@/hooks/useOrgBoard';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useFocusPresence } from '@/hooks/useFocusPresence';
import { useCarousel } from '@/hooks/useCarousel';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { MemberSummary, Todo } from '@/types/db';
import { CalendarView } from './CalendarView';
import MemberColumn from './MemberColumn';
import HandoffModal from './HandoffModal';
import { BoardSkeleton } from './BoardSkeleton';

export default function BoardClient() {
  const {
    activeOrgId,
    userId,
    orgs,
    isManager,
    openMenu,
    pendingInvites,
    profile,
    boardMode: mode,
  } = useApp();
  const queryClient = useQueryClient();
  const locale = useLocale() as Locale;
  const t = useTranslations('board');

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  useBoardRealtime(activeOrgId);
  useOrgPresence(activeOrgId, userId);
  const { typingByTodoId, broadcastTyping } = useTypingPresence(
    activeOrgId,
    userId,
    profile?.display_name ?? null
  );
  const { focusByTodoId, broadcastFocus, broadcastUnfocus } = useFocusPresence(
    activeOrgId,
    userId
  );

  // 완료 표시 여부는 설정(내 설정)에서 계정에 저장한다 — 기기를 옮겨도 같은 화면이어야 한다.
  // 기본은 보임: 팀원이 뭘 끝냈는지가 곧 공유의 목적이다.
  const showDone = profile?.show_done ?? true;
  const [handoff, setHandoff] = useState<Todo | null>(null);

  /*
    펼쳐 둔 카드는 보드 전체에서 하나뿐이다.
    여러 개가 동시에 열려 있으면 컬럼이 길어져 무엇이 남았는지 한눈에 안 들어온다.

    어느 뷰에서 열었는지도 같이 들고 있는다 — 뷰를 바꿨다 돌아왔을 때 카드가 펼쳐진 채로
    남아 있으면 안 되는데, 뷰 전환은 헤더에서 일어나서 여기서 감지할 수가 없다.
    렌더할 때 뷰를 비교하면 상태를 하나 더 두지 않고도 같은 결과가 된다.
  */
  const [openTodo, setOpenTodo] = useState<{ mode: string; id: string } | null>(null);
  const openTodoId = openTodo?.mode === mode ? openTodo.id : null;
  const toggleOpenTodo = (todoId: string) =>
    setOpenTodo(current =>
      current?.id === todoId && current.mode === mode ? null : { mode, id: todoId }
    );

  /*
    펼쳐진 카드가 바뀔 때마다(열림·닫힘·다른 카드로 전환·뷰 전환으로 openTodoId가 null이
    되는 경우 전부) 다른 멤버에게 포커스 방송을 한다. setOpenTodo를 부르는 자리마다
    일일이 방송을 걸면(goToMember처럼 openTodo를 직접 건드리는 곳도 있어서) 빠뜨리기 쉽다 —
    파생값인 openTodoId 하나만 감시하면 어떤 경로로 바뀌든 놓치지 않는다.
    cleanup이 곧 "이전 카드 unfocus"라, 다음 값으로 바뀌기 직전에 자동으로 실행된다.
  */
  useEffect(() => {
    if (!openTodoId) return;
    broadcastFocus(openTodoId);
    return () => broadcastUnfocus(openTodoId);
  }, [openTodoId, broadcastFocus, broadcastUnfocus]);

  function goToMember(index: number) {
    goTo(index);
    setOpenTodo(null);
  }

  // 내 컬럼을 항상 맨 앞으로 — 내 할 일을 먼저 보게 한다.
  const orderedMembers = useMemo(() => {
    const list = members.data ?? [];
    return [...list].sort((a, b) => {
      if (a.user_id === userId) return -1;
      if (b.user_id === userId) return 1;
      return a.display_name.localeCompare(b.display_name, locale);
    });
  }, [members.data, userId, locale]);

  // 같이하기로 참여한 할 일은 주인 컬럼뿐 아니라 참여자 컬럼에도 똑같이 뜬다 —
  // 같은 Todo 객체 참조를 여러 컬럼 목록에 넣어도 각 컬럼은 독립적으로 렌더링되니 문제없다.
  const todosByOwner = useMemo(() => {
    const map = new Map<string, Todo[]>();
    const push = (uid: string, t: Todo) => {
      const list = map.get(uid) ?? [];
      list.push(t);
      map.set(uid, list);
    };
    (todos.data ?? []).forEach(t => {
      push(t.owner_id, t);
      (t.participant_ids ?? []).forEach(uid => {
        if (uid !== t.owner_id) push(uid, t);
      });
    });
    return map;
  }, [todos.data]);

  /*
    한 화면에 한 명만 보이는 모바일에서만 순환시킨다.
    데스크톱은 컬럼이 여러 개 동시에 보여서, 끝에서 되감기면 화면이 뚝 끊긴 것처럼 보인다.
  */
  /*
    resetKey에 mode를 섞는다. 대시보드에 다녀오면 캐러셀이 통째로 다시 마운트되는데,
    그때 위치를 다시 잡지 않으면 스크롤이 0에 남아 엉뚱한 사람 컬럼부터 보인다.
    보드는 언제 열어도 내 할 일부터 보여야 한다.
  */
  const { scrollerRef, activeIndex, onScroll, goTo, registerNode } = useCarousel(
    orderedMembers.length,
    `${activeOrgId}:${mode}`
  );

  /*
    뷰 전환 모션.
    transform은 바깥 래퍼에만 건다 — 스크롤 스냅 컨테이너 자체에 걸면 스냅 위치가 어긋난다.
    모션을 끈 사용자에게는 없앤다 (framer-motion은 CSS 미디어 쿼리를 따르지 않는다).
  */
  const reduceMotion = useReducedMotion();
  const viewMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const },
      };

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-safe text-center">
        <h1 className="text-heading-1 text-ink">{t('noOrgTitle')}</h1>
        <p className="mt-2 text-body-sm text-ink-muted">{t('noOrgDescription')}</p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/orgs/new"
            className="flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('createOrg')}
          </Link>
          <button
            type="button"
            onClick={openMenu}
            className="flex h-13 items-center justify-center gap-1.5 rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            {t('checkInvites')}
            {pendingInvites > 0 && <span className="size-2 rounded-full bg-danger" />}
          </button>
        </div>
      </main>
    );
  }

  const loading = members.isLoading || todos.isLoading;
  const error = members.error ?? todos.error;
  // 공유 보드인데 혼자면 기능의 절반이 비어 있는 셈이다 — 다음 할 일을 알려 준다
  const soloMember = !loading && !error && orderedMembers.length === 1;
  const handoffOwner = handoff
    ? orderedMembers.find(m => m.user_id === handoff.owner_id)?.display_name ?? t('teammate')
    : '';

  /* 칩은 여러 명일 때만 값을 한다 — 둘 이하면 옆으로 한 번 미는 게 전부다 */
  const showChips = mode === 'board' && orderedMembers.length > 2;

  return (
    <main
      className="mx-auto w-full max-w-[1400px]"
      /*
        칩 툴바를 감출 때는 board-viewport가 빼던 높이도 같이 돌려줘야 한다 —
        안 그러면 칩이 있던 자리가 빈 띠로 남아 컬럼이 그만큼 짧아진다.
      */
      style={showChips ? undefined : ({ '--board-toolbar-h': '0px' } as React.CSSProperties)}
    >
      {/*
        멤버 칩은 보드 전용이고 모바일 전용이다 — 다른 뷰에서 툴바를 남겨 두면
        빈 띠가 화면 위를 먹는다. (뷰 전환은 헤더로, 완료 보기는 설정으로 옮겼다)

        둘 이하면 아예 감춘다. 칩이 하는 일은 "여러 명 중 원하는 사람으로 바로 가기"인데,
        둘뿐이면 옆으로 한 번 미는 것으로 끝나고 이름과 남은 개수는 컬럼 헤더에 이미 있다.
        폰에서 늘 보이는 44px 한 줄은 그 값을 하기에 비싸다.
      */}
      {showChips && (
        <div className="flex h-[var(--board-toolbar-h)] items-center px-3 sm:hidden">
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1">
            {orderedMembers.map((m, i) => (
              <MemberChip
                key={m.user_id}
                member={m}
                isMe={m.user_id === userId}
                active={i === activeIndex}
                remaining={
                  (todosByOwner.get(m.user_id) ?? []).filter(t => t.status !== 'done').length
                }
                onClick={() => goToMember(i)}
              />
            ))}
          </div>
        </div>
      )}

      {loading && <BoardSkeleton />}

      {error && (
        <Card className="mx-3 p-5 text-[14px] text-danger sm:mx-4">
          {error instanceof Error ? error.message : t('loadError')}
        </Card>
      )}

      {/* ── 보드 : 가로 캐러셀 ──
          페이지 전체를 늘리는 대신 이 영역 높이를 뷰포트에 고정하고 컬럼 내부만 스크롤한다.
          내 컬럼이 항상 첫 번째라 처음 열면 내 할 일부터 보이고, 양옆으로 넘기면 팀원이 나온다. */}
      {/* mode="wait" — 두 뷰가 겹쳐 있으면 높이가 서로 달라 화면이 출렁인다 */}
      <AnimatePresence mode="wait" initial={false}>
        {!loading && !error && mode === 'board' && (
          <motion.div key="board" {...viewMotion}>
            {/*
              scroll-pl은 스냅 기준선을 좌측 패딩만큼 밀어 준다.
              없으면 두 번째 컬럼부터 패딩을 무시하고 화면 왼쪽 끝에 붙어서,
              오른쪽에 다음 컬럼이 패딩 폭만큼 삐져나온다.
            */}
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="snap-board board-viewport flex cursor-grab gap-3 overflow-x-auto scroll-pl-3 px-3 pb-3 sm:scroll-pl-4 sm:px-4"
            >
              {orderedMembers.map((m, i) => (
                <MemberColumn
                  key={m.user_id}
                  ref={registerNode(i)}
                  member={m}
                  todos={todosByOwner.get(m.user_id) ?? []}
                  orgId={activeOrgId!}
                  currentUserId={userId}
                  isManager={isManager}
                  members={orderedMembers}
                  showDone={showDone}
                  openTodoId={openTodoId}
                  onToggleOpen={toggleOpenTodo}
                  onHandoff={setHandoff}
                  typingByTodoId={typingByTodoId}
                  onTyping={broadcastTyping}
                  focusByTodoId={focusByTodoId}
                  /*
                    모바일은 한 화면에 한 명만 보인다 — w-full은 스크롤 컨테이너의 콘텐츠 폭이라
                    좌우 패딩(px-3)과 정확히 맞아떨어져 옆 컬럼이 삐져나오지 않는다.
                    (100vw로 잡으면 스크롤바 폭만큼 어긋난다)
                  */
                  className="w-full sm:w-[330px]"
                />
              ))}

              {soloMember && (
                <InviteColumn isManager={isManager} className="w-full sm:w-[330px]" />
              )}
            </div>
          </motion.div>
        )}

        {/* ── 대시보드 : 세로로 전부 쌓아 위아래 스크롤로 한 번에 훑는다 ── */}
        {!loading && !error && mode === 'dashboard' && (
          <motion.div
            key="dashboard"
            {...viewMotion}
            className="flex flex-col gap-3 px-3 pt-3 pb-safe sm:grid sm:grid-cols-2 sm:px-4 lg:grid-cols-3"
          >
            {orderedMembers.map(m => (
              <MemberColumn
                key={m.user_id}
                member={m}
                todos={todosByOwner.get(m.user_id) ?? []}
                orgId={activeOrgId!}
                currentUserId={userId}
                isManager={isManager}
                members={orderedMembers}
                showDone={showDone}
                stacked
                openTodoId={openTodoId}
                onToggleOpen={toggleOpenTodo}
                onHandoff={setHandoff}
                typingByTodoId={typingByTodoId}
                onTyping={broadcastTyping}
                focusByTodoId={focusByTodoId}
              />
            ))}

            {soloMember && <InviteColumn isManager={isManager} className="w-full" />}
          </motion.div>
        )}

        {/* ── 달력 : 마감일 기준으로 조직 전체를 훑는다 ── */}
        {!loading && !error && mode === 'calendar' && (
          <motion.div key="calendar" {...viewMotion}>
            <CalendarView
              orgId={activeOrgId}
              todos={todos.data ?? []}
              members={orderedMembers}
              showDone={showDone}
              currentUserId={userId}
              isManager={isManager}
              onHandoff={setHandoff}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {handoff && (
        <HandoffModal
          todo={handoff}
          ownerName={handoffOwner}
          onClose={() => setHandoff(null)}
          onDone={refresh}
        />
      )}
    </main>
  );
}

function InviteColumn({ isManager, className }: { isManager: boolean; className?: string }) {
  const t = useTranslations('board');
  return (
    <section
      className={cn(
        'snap-col flex h-full shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-strong bg-transparent p-6 text-center',
        className
      )}
    >
      <p className="text-title text-ink">{t('soloTitle')}</p>
      <p className="text-caption text-ink-muted">
        {isManager ? t('soloDescriptionManager') : t('soloDescriptionMember')}
      </p>
      {isManager ? (
        <Link
          href="/team"
          className="mt-2 flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-ink transition-transform active:scale-[0.98]"
        >
          {t('inviteMembers')}
        </Link>
      ) : (
        <p className="mt-2 text-caption text-ink-faint">{t('askOwnerToInvite')}</p>
      )}
    </section>
  );
}

function MemberChip({
  member,
  isMe,
  active,
  remaining,
  onClick,
}: {
  member: MemberSummary;
  isMe: boolean;
  active: boolean;
  remaining: number;
  onClick: () => void;
}) {
  const t = useTranslations('board');
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-full border pl-1 pr-2.5 no-select transition-colors active:scale-[0.97]',
        active
          ? 'border-hairline-strong bg-surface text-ink'
          : 'border-transparent bg-canvas-soft text-ink-muted'
      )}
    >
      <Avatar
        name={member.display_name}
        color={member.avatar_color}
        imageUrl={member.avatar_url}
        seed={member.user_id}
        size="sm"
      />
      <span className="max-w-[80px] truncate text-[13px] font-medium">
        {isMe ? t('you') : member.display_name}
      </span>
      {remaining > 0 && (
        <span
          className={cn(
            'grid min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums',
            active ? 'bg-accent text-accent-ink' : 'bg-hairline text-ink-secondary'
          )}
        >
          {remaining}
        </span>
      )}
    </button>
  );
}
