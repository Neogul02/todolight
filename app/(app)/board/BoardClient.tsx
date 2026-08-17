'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { useOrgMembers, useOrgTodos } from '@/hooks/useOrgBoard';
import { useTypingPresence } from '@/hooks/useTypingPresence';
import { useFocusPresence } from '@/hooks/useFocusPresence';
import { useCarousel } from '@/hooks/useCarousel';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/locales';
import type { MemberSummary, Todo } from '@/types/db';
import MemberColumn from './MemberColumn';
import { BoardSkeleton } from './BoardSkeleton';

/**
 * 보드 패널 — 멤버별 컬럼을 가로 캐러셀(모바일)이나 격자(PC 대시보드)로 그린다.
 *
 * 조직 단위로 하나뿐이어야 하는 것들은 여기 없다:
 * 실시간 구독·접속 표시는 ViewPager가, 대신 처리 시트는 `onHandoff`로 올려 보낸다 —
 * 달력 패널과 동시에 살아 있기 때문에 각자 열면 같은 채널이 두 번 열리고 시트가 두 벌이 된다.
 */
export default function BoardClient({ onHandoff }: { onHandoff: (todo: Todo) => void }) {
  const { activeOrgId, userId, isManager, profile, boardMode: mode } = useApp();
  const locale = useLocale() as Locale;
  const t = useTranslations('board');

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
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
    resetKey에 mode를 섞는다. 대시보드에 다녀오면 캐러셀이 통째로 다시 마운트되는데,
    그때 위치를 다시 잡지 않으면 스크롤이 0에 남아 엉뚱한 사람 컬럼부터 보인다.
    보드는 언제 열어도 내 할 일부터 보여야 한다.

    **달력·가계부는 여기 안 들어간다.** 셋은 같은 페이지의 패널이라 옆으로 밀려 나가도
    이 컴포넌트가 살아 있다 — 다녀왔다고 보던 사람을 첫 컬럼으로 끌고 오면 자리를 잃는다.
  */
  const { scrollerRef, activeIndex, onScroll, goTo, registerNode } = useCarousel(
    orderedMembers.length,
    `${activeOrgId}:${mode}`
  );

  /*
    뷰 전환 모션.
    transform은 바깥 래퍼에만 건다 — 스크롤 스냅 컨테이너 자체에 걸면 스냅 위치가 어긋난다.
    모션을 끈 사용자에게는 없앤다 (framer-motion은 CSS 미디어 쿼리를 따르지 않는다).
    useMemo로 감싸는 이유: 감싸지 않으면 렌더마다 새 객체가 생겨서, 애니메이션이 끝나기
    전에 이 컴포넌트가 다시 렌더되면(진행 중인 쿼리·실시간 갱신 등으로 흔하다) framer-motion이
    "새 애니메이션"으로 오인해 처음부터 다시 튼다 — 화면이 한 번 보였다가 다시 페이드인되는
    것처럼 보인다.
  */
  const reduceMotion = useReducedMotion();
  const viewMotion = useMemo(
    () =>
      reduceMotion
        ? {}
        : {
            initial: { opacity: 0, y: 8 },
            animate: { opacity: 1, y: 0 },
            exit: { opacity: 0, y: -8 },
            transition: { duration: 0.2, ease: [0.22, 0.61, 0.36, 1] as const },
          },
    [reduceMotion]
  );

  const loading = members.isLoading || todos.isLoading;
  const error = members.error ?? todos.error;
  // 공유 보드인데 혼자면 기능의 절반이 비어 있는 셈이다 — 다음 할 일을 알려 준다
  const soloMember = !loading && !error && orderedMembers.length === 1;

  /*
    멤버 칩은 보드 뷰에서 항상 띄운다.
    멤버가 늘수록 원하는 사람까지 좌우로 미는 손이 많아지는데, 칩을 누르면 한 번에 간다 —
    칩이 값을 하는 건 오히려 사람이 많을 때다. (한때 "둘 이하면 감춘다"로 두었지만,
    감춰서 얻는 44px보다 목적지로 바로 가는 쪽이 크다.)
  */
  const showChips = mode === 'board' && orderedMembers.length > 0;

  return (
    /*
      패널 높이(app-viewport)를 그대로 받아 flex로 나눈다 — 칩 툴바는 있는 만큼만 먹고
      나머지를 캐러셀이 가져간다. 예전엔 board-viewport가 dvh에서 헤더·툴바·탭바를 직접
      빼느라, 칩이 없을 때 `--board-toolbar-h`를 인라인으로 0px로 덮는 보정까지 필요했다.
    */
    <main className="mx-auto flex h-full w-full max-w-[1400px] flex-col">
      {/*
        멤버 칩은 보드 전용이고 모바일 전용이다 — 다른 뷰에서 툴바를 남겨 두면
        빈 띠가 화면 위를 먹는다. (뷰 전환은 헤더로, 완료 보기는 설정으로 옮겼다)
      */}
      {showChips && (
        // 헤더가 없어 이 칩 줄이 모바일 화면의 맨 위다 — pt-safe로 노치를 피하고,
        // 우측은 그 위에 뜬 아바타 버튼(size-11)만큼 비워 칩이 아바타 밑에 깔리지 않게 한다.
        <div className="flex h-[var(--board-toolbar-h)] shrink-0 items-center px-3 pt-safe sm:hidden">
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1 pr-12">
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

      {loading && (
        <div className="min-h-0 flex-1">
          <BoardSkeleton />
        </div>
      )}

      {error && (
        <Card className="mx-3 p-5 text-[14px] text-danger sm:mx-4">
          {error instanceof Error ? error.message : t('loadError')}
        </Card>
      )}

      {/* ── 보드 : 가로 캐러셀 ──
          페이지 전체를 늘리는 대신 남은 높이를 다 쓰고 컬럼 내부만 스크롤한다.
          내 컬럼이 항상 첫 번째라 처음 열면 내 할 일부터 보이고, 양옆으로 넘기면 팀원이 나온다. */}
      {/* mode="wait" — 두 뷰가 겹쳐 있으면 높이가 서로 달라 화면이 출렁인다 */}
      <AnimatePresence mode="wait" initial={false}>
        {!loading && !error && mode === 'board' && (
          <motion.div key="board" {...viewMotion} className="min-h-0 flex-1">
            {/*
              scroll-pl은 스냅 기준선을 좌측 패딩만큼 밀어 준다.
              없으면 두 번째 컬럼부터 패딩을 무시하고 화면 왼쪽 끝에 붙어서,
              오른쪽에 다음 컬럼이 패딩 폭만큼 삐져나온다.
            */}
            <div
              ref={scrollerRef}
              onScroll={onScroll}
              className="snap-board flex h-full cursor-grab gap-3 overflow-x-auto scroll-pl-3 px-3 pb-3 sm:scroll-pl-4 sm:px-4"
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
                  onHandoff={onHandoff}
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
            /*
              대시보드는 내용만큼 길어진다 — 예전엔 페이지가 늘어나 body가 스크롤했지만
              이제는 패널 높이가 고정이라 이 격자가 자기 안에서 스크롤한다.
            */
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-tabbar sm:grid sm:grid-cols-2 sm:px-4 sm:pb-3 lg:grid-cols-3"
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
                onHandoff={onHandoff}
                typingByTodoId={typingByTodoId}
                onTyping={broadcastTyping}
                focusByTodoId={focusByTodoId}
              />
            ))}

            {soloMember && <InviteColumn isManager={isManager} className="w-full" />}
          </motion.div>
        )}
      </AnimatePresence>
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
