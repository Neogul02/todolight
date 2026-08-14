'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  boardKeys,
  useBoardRealtime,
  useOrgMembers,
  useOrgPresence,
  useOrgTodos,
} from '@/hooks/useOrgBoard';
import { useLoopCarousel } from '@/hooks/useLoopCarousel';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { MemberSummary, Todo } from '@/types/db';
import { CalendarView } from './CalendarView';
import MemberColumn from './MemberColumn';
import HandoffModal from './HandoffModal';
import { BoardSkeleton } from './BoardSkeleton';

/**
 * board     = 멤버별 가로 캐러셀 (기본)
 * dashboard = 세로로 전부 쌓아 한 번에 훑기
 * calendar  = 마감일 기준으로 언제 몰려 있나 보기
 */
type Mode = 'board' | 'dashboard' | 'calendar';

const MODES: { key: Mode; label: string; Icon: (p: { className?: string }) => React.ReactElement }[] =
  [
    { key: 'board', label: '보드', Icon: BoardIcon },
    { key: 'dashboard', label: '대시보드', Icon: DashboardIcon },
    { key: 'calendar', label: '달력', Icon: CalendarIcon },
  ];

export default function BoardClient() {
  const { activeOrgId, userId, orgs, isManager, openMenu, pendingInvites, profile } = useApp();
  const queryClient = useQueryClient();

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  useBoardRealtime(activeOrgId);
  useOrgPresence(activeOrgId, userId);

  // 완료 표시 여부는 설정(내 설정)에서 계정에 저장한다 — 기기를 옮겨도 같은 화면이어야 한다.
  // 기본은 보임: 팀원이 뭘 끝냈는지가 곧 공유의 목적이다.
  const showDone = profile?.show_done ?? true;
  const [mode, setMode] = useState<Mode>('board');
  const [handoff, setHandoff] = useState<Todo | null>(null);

  // 내 컬럼을 항상 맨 앞으로 — 내 할 일을 먼저 보게 한다.
  const orderedMembers = useMemo(() => {
    const list = members.data ?? [];
    return [...list].sort((a, b) => {
      if (a.user_id === userId) return -1;
      if (b.user_id === userId) return 1;
      return a.display_name.localeCompare(b.display_name, 'ko');
    });
  }, [members.data, userId]);

  const todosByOwner = useMemo(() => {
    const map = new Map<string, Todo[]>();
    (todos.data ?? []).forEach(t => {
      const list = map.get(t.owner_id) ?? [];
      list.push(t);
      map.set(t.owner_id, list);
    });
    return map;
  }, [todos.data]);

  /*
    한 화면에 한 명만 보이는 모바일에서만 순환시킨다.
    데스크톱은 컬럼이 여러 개 동시에 보여서, 끝에서 되감기면 화면이 뚝 끊긴 것처럼 보인다.
  */
  const oneAtATime = !useMediaQuery('(min-width: 640px)');
  /*
    resetKey에 mode를 섞는다. 대시보드에 다녀오면 캐러셀이 통째로 다시 마운트되는데,
    그때 위치를 다시 잡지 않으면 스크롤이 0에 남아 엉뚱한 사람 컬럼부터 보인다.
    보드는 언제 열어도 내 할 일부터 보여야 한다.
  */
  const { scrollerRef, slides, activeIndex, onScroll, goTo, registerNode } = useLoopCarousel(
    orderedMembers,
    m => m.user_id,
    oneAtATime,
    `${activeOrgId}:${mode}`
  );

  // 모션을 끈 사용자에게는 전환을 없앤다 (framer-motion은 CSS 미디어 쿼리를 따르지 않는다)
  const reduceMotion = useReducedMotion();
  const viewTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.22, 0.61, 0.36, 1] as const };

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-safe text-center">
        <h1 className="text-heading-1 text-ink">아직 조직이 없어요</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          조직을 만들어 팀원을 초대하거나, 받은 초대를 수락해 주세요.
        </p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/orgs/new"
            className="flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            조직 만들기
          </Link>
          <button
            type="button"
            onClick={openMenu}
            className="flex h-13 items-center justify-center gap-1.5 rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            받은 초대 확인
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
    ? orderedMembers.find(m => m.user_id === handoff.owner_id)?.display_name ?? '팀원'
    : '';

  return (
    <main className="mx-auto w-full max-w-[1400px]">
      {/* ── 툴바 : 멤버 칩 + 뷰 전환. 완료 보기는 설정으로 내렸다 ── */}
      <div className="flex h-[var(--board-toolbar-h)] items-center gap-2 px-3 sm:px-4">
        {mode === 'board' && orderedMembers.length > 0 && (
          <div className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1 sm:hidden [&::-webkit-scrollbar]:hidden">
            {orderedMembers.map((m, i) => (
              <MemberChip
                key={m.user_id}
                member={m}
                isMe={m.user_id === userId}
                active={i === activeIndex}
                remaining={
                  (todosByOwner.get(m.user_id) ?? []).filter(t => t.status !== 'done').length
                }
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        )}

        {/* 좁은 화면에서는 라벨을 접고 아이콘만 남긴다 — 멤버 칩이 쓸 자리를 뺏지 않도록 */}
        <div className="ml-auto flex h-9 shrink-0 overflow-hidden rounded-lg border border-hairline no-select">
          {MODES.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              aria-label={label}
              className={cn(
                'flex items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors',
                mode === key ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted'
              )}
            >
              <Icon className="size-4" />
              <span className={cn(mode === key ? 'inline' : 'hidden sm:inline')}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <BoardSkeleton />}

      {error && (
        <Card className="mx-3 p-5 text-[14px] text-danger sm:mx-4">
          {error instanceof Error ? error.message : '보드를 불러오지 못했어요.'}
        </Card>
      )}

      {/* ── 보드 : 가로 캐러셀 ──
          페이지 전체를 늘리는 대신 이 영역 높이를 뷰포트에 고정하고 컬럼 내부만 스크롤한다.
          내 컬럼이 항상 첫 번째라 처음 열면 내 할 일부터 보이고, 양옆으로 넘기면 팀원이 나온다. */}
      {/*
        mode="wait" — 두 뷰가 겹쳐 있으면 높이가 서로 달라 화면이 출렁인다.
        transform은 주지 않는다. 스크롤 스냅 컨테이너에 transform을 걸면 스냅 위치가 어긋난다.
      */}
      <AnimatePresence mode="wait" initial={false}>
        {!loading && !error && mode === 'board' && (
          <motion.div
            key="board"
            ref={scrollerRef}
            onScroll={onScroll}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={viewTransition}
          /*
            scroll-pl은 스냅 기준선을 좌측 패딩만큼 밀어 준다.
            없으면 두 번째 컬럼부터 패딩을 무시하고 화면 왼쪽 끝에 붙어서, 오른쪽에 다음 컬럼이
            패딩 폭만큼 삐져나온다.
          */
            className="snap-board board-viewport flex gap-3 overflow-x-auto scroll-pl-3 px-3 pb-3 sm:scroll-pl-4 sm:px-4"
          >
            {slides.map((slide, i) => (
              <MemberColumn
                key={slide.key}
                ref={registerNode(i)}
                member={slide.item}
                todos={todosByOwner.get(slide.item.user_id) ?? []}
                orgId={activeOrgId!}
                currentUserId={userId}
                isManager={isManager}
                members={orderedMembers}
                showDone={showDone}
                onCreated={refresh}
                onHandoff={setHandoff}
              /*
                모바일은 한 화면에 한 명만 보인다 — w-full은 스크롤 컨테이너의 콘텐츠 폭이라
                좌우 패딩(px-3)과 정확히 맞아떨어져 옆 컬럼이 삐져나오지 않는다.
                (100vw로 잡으면 스크롤바 폭만큼 어긋난다)
              */
                className="w-full sm:w-[330px]"
              />
            ))}

            {soloMember && <InviteColumn isManager={isManager} className="w-full sm:w-[330px]" />}
          </motion.div>
        )}

        {/* ── 대시보드 : 세로로 전부 쌓아 위아래 스크롤로 한 번에 훑는다 ── */}
        {!loading && !error && mode === 'dashboard' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={viewTransition}
            className="flex flex-col gap-3 px-3 pb-safe sm:grid sm:grid-cols-2 sm:px-4 lg:grid-cols-3"
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
                onCreated={refresh}
                onHandoff={setHandoff}
              />
            ))}

            {soloMember && <InviteColumn isManager={isManager} className="w-full" />}
          </motion.div>
        )}

        {/* ── 달력 : 마감일 기준으로 조직 전체를 훑는다 ── */}
        {!loading && !error && mode === 'calendar' && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={viewTransition}
          >
            <CalendarView
              todos={todos.data ?? []}
              members={orderedMembers}
              showDone={showDone}
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
  return (
    <section
      className={cn(
        'snap-col flex h-full shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-hairline-strong bg-transparent p-6 text-center',
        className
      )}
    >
      <p className="text-title text-ink">아직 혼자예요</p>
      <p className="text-caption text-ink-muted">
        {isManager
          ? '팀원을 초대하면 서로의 할 일이 여기 나란히 놓여요.'
          : '방장이 팀원을 초대하면 서로의 할 일이 여기 나란히 놓여요.'}
      </p>
      {isManager ? (
        <Link
          href="/team"
          className="mt-2 flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-[15px] font-medium text-accent-ink transition-transform active:scale-[0.98]"
        >
          팀원 초대하기
        </Link>
      ) : (
        <p className="mt-2 text-caption text-ink-faint">방장에게 초대를 요청해 주세요.</p>
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
        {isMe ? '나' : member.display_name}
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

function BoardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="7" height="16" rx="1.6" />
      <rect x="13.5" y="4" width="7" height="16" rx="1.6" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </svg>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="5.5" rx="1.6" />
      <rect x="3.5" y="12.5" width="17" height="7.5" rx="1.6" />
    </svg>
  );
}
