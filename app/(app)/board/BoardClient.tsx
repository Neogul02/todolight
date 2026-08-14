'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  boardKeys,
  useBoardRealtime,
  useOrgMembers,
  useOrgPresence,
  useOrgTodos,
} from '@/hooks/useOrgBoard';
import { useApp } from '../OrgContext';
import { Avatar } from '@/components/Avatar';
import { Button, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { MemberSummary, Todo } from '@/types/db';
import MemberColumn from './MemberColumn';
import HandoffModal from './HandoffModal';

/** board = 멤버별 가로 캐러셀(기본), dashboard = 세로로 전부 쌓아 한 번에 훑기 */
type Mode = 'board' | 'dashboard';

export default function BoardClient() {
  const { activeOrgId, userId, orgs, isManager } = useApp();
  const queryClient = useQueryClient();

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  useBoardRealtime(activeOrgId);
  useOrgPresence(activeOrgId, userId);

  // 완료한 일도 기본으로 보여 준다 — 팀원이 뭘 끝냈는지가 곧 공유의 목적이다.
  const [showDone, setShowDone] = useState(true);
  const [mode, setMode] = useState<Mode>('board');
  const [handoff, setHandoff] = useState<Todo | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef<(HTMLElement | null)[]>([]);

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

  // 스와이프로 넘어간 위치를 아바타 스트립·인디케이터에 반영한다.
  const syncActiveIndex = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const center = scroller.scrollLeft + scroller.clientWidth / 2;
    let nearest = 0;
    let nearestDistance = Infinity;
    columnRefs.current.forEach((el, i) => {
      if (!el) return;
      const elCenter = el.offsetLeft + el.offsetWidth / 2;
      const distance = Math.abs(elCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
    });
    setActiveIndex(nearest);
  }, []);

  function goToMember(index: number) {
    columnRefs.current[index]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest',
    });
  }

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-16 pb-safe text-center">
        <h1 className="text-heading-1 text-ink">아직 조직이 없습니다</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          조직을 만들어 팀원을 초대하거나, 받은 초대를 수락하세요.
        </p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Link
            href="/orgs/new"
            className="flex h-13 items-center justify-center rounded-2xl bg-accent px-6 text-[16px] font-medium text-accent-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            조직 만들기
          </Link>
          <Link
            href="/invites"
            className="flex h-13 items-center justify-center rounded-2xl border border-hairline-strong bg-surface px-6 text-[16px] font-medium text-ink transition-transform active:scale-[0.98] sm:h-12 sm:rounded-xl sm:text-[15px]"
          >
            받은 초대 확인
          </Link>
        </div>
      </main>
    );
  }

  const loading = members.isLoading || todos.isLoading;
  const error = members.error ?? todos.error;
  const handoffOwner = handoff
    ? orderedMembers.find(m => m.user_id === handoff.owner_id)?.display_name ?? '팀원'
    : '';

  return (
    <main className="mx-auto w-full max-w-[1400px]">
      {/* ── 툴바 : 멤버 칩 + 대시보드/완료 토글 ── */}
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
                onClick={() => goToMember(i)}
              />
            ))}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMode(m => (m === 'board' ? 'dashboard' : 'board'))}
            aria-pressed={mode === 'dashboard'}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium no-select transition-colors active:scale-[0.97]',
              mode === 'dashboard'
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-hairline bg-transparent text-ink-muted'
            )}
          >
            <DashboardIcon className="size-4" />
            대시보드
          </button>

          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            aria-pressed={showDone}
            // 라벨이 상태를 말해 주지 않으므로 켜짐/꺼짐을 채움 여부로 확실히 구분한다
            className={cn(
              'h-9 rounded-lg border px-3 text-[13px] font-medium no-select transition-colors active:scale-[0.97]',
              showDone
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-hairline bg-transparent text-ink-faint'
            )}
          >
            완료
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 px-4 py-16 text-ink-muted">
          <Spinner /> 불러오는 중…
        </div>
      )}

      {error && (
        <Card className="mx-3 p-5 text-[14px] text-danger sm:mx-4">
          {error instanceof Error ? error.message : '보드를 불러오지 못했습니다.'}
        </Card>
      )}

      {/* ── 보드 : 가로 캐러셀 ──
          페이지 전체를 늘리는 대신 이 영역 높이를 뷰포트에 고정하고 컬럼 내부만 스크롤한다.
          내 컬럼이 항상 첫 번째라 처음 열면 내 할 일부터 보이고, 양옆으로 넘기면 팀원이 나온다. */}
      {!loading && !error && mode === 'board' && (
        <div
          ref={scrollerRef}
          onScroll={syncActiveIndex}
          /*
            scroll-pl은 스냅 기준선을 좌측 패딩만큼 밀어 준다.
            없으면 두 번째 컬럼부터 패딩을 무시하고 화면 왼쪽 끝에 붙어서, 오른쪽에 다음 컬럼이
            패딩 폭만큼 삐져나온다.
          */
          className="snap-board board-viewport flex gap-3 overflow-x-auto scroll-pl-3 px-3 pb-3 sm:scroll-pl-4 sm:px-4"
        >
          {orderedMembers.map((m, i) => (
            <MemberColumn
              key={m.user_id}
              ref={el => {
                columnRefs.current[i] = el;
              }}
              member={m}
              todos={todosByOwner.get(m.user_id) ?? []}
              orgId={activeOrgId!}
              currentUserId={userId}
              isManager={isManager}
              members={orderedMembers}
              showDone={showDone}
              onMutated={refresh}
              onHandoff={setHandoff}
              /*
                모바일은 한 화면에 한 명만 보인다 — w-full은 스크롤 컨테이너의 콘텐츠 폭이라
                좌우 패딩(px-3)과 정확히 맞아떨어져 옆 컬럼이 삐져나오지 않는다.
                (100vw로 잡으면 스크롤바 폭만큼 어긋난다)
              */
              className="w-full sm:w-[330px]"
            />
          ))}
        </div>
      )}

      {/* ── 대시보드 : 세로로 전부 쌓아 위아래 스크롤로 한 번에 훑는다 ── */}
      {!loading && !error && mode === 'dashboard' && (
        <div className="flex flex-col gap-3 px-3 pb-safe sm:grid sm:grid-cols-2 sm:px-4 lg:grid-cols-3">
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
              onMutated={refresh}
              onHandoff={setHandoff}
            />
          ))}
        </div>
      )}

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
      <Avatar name={member.display_name} color={member.avatar_color} seed={member.user_id} size="sm" />
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

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="4" width="17" height="5.5" rx="1.6" />
      <rect x="3.5" y="12.5" width="17" height="7.5" rx="1.6" />
    </svg>
  );
}
