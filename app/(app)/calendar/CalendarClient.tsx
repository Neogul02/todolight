'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { boardKeys, useBoardRealtime, useOrgMembers, useOrgTodos } from '@/hooks/useOrgBoard';
import { useOrgEvents } from '@/hooks/useOrgEvents';
import { useApp } from '../OrgContext';
import { Card } from '@/components/ui';
import type { Todo } from '@/types/db';
import { CalendarView } from './CalendarView';
import { CalendarSkeleton } from './CalendarSkeleton';
import HandoffModal from '../board/HandoffModal';

/**
 * 달력 — 조직 전체를 마감일·일정 기준으로 훑는 별도 화면.
 *
 * 예전엔 보드 안의 뷰 중 하나였지만, 보드·대시보드·가계부와 나란한 목적지로 분리했다.
 * todos·members 쿼리 키는 보드와 같아서(hooks/useOrgBoard) 보드를 먼저 봤다면 그 캐시를
 * 그대로 물려받는다 — 조직만 같으면 어느 화면에서 먼저 불렀든 데이터가 데워져 있다.
 */
export default function CalendarClient() {
  const { activeOrgId, userId, orgs, isManager, openMenu, pendingInvites, profile } = useApp();
  const queryClient = useQueryClient();
  const t = useTranslations('board');

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  const events = useOrgEvents(activeOrgId);
  useBoardRealtime(activeOrgId);

  const showDone = profile?.show_done ?? true;
  const [handoff, setHandoff] = useState<Todo | null>(null);

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

  // todos·members는 보드에서 이미 캐시돼 있을 때가 많지만, 여기로 바로 들어오면 처음 요청이다.
  const loading = members.isLoading || todos.isLoading || events.isLoading;
  const error = members.error ?? todos.error ?? events.error;
  const handoffOwner = handoff
    ? members.data?.find(m => m.user_id === handoff.owner_id)?.display_name ?? t('teammate')
    : '';

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  return (
    <>
      {loading && <CalendarSkeleton />}

      {error && (
        <Card className="mx-3 mt-3 p-5 text-[14px] text-danger sm:mx-4">
          {error instanceof Error ? error.message : t('loadError')}
        </Card>
      )}

      {!loading && !error && (
        <CalendarView
          orgId={activeOrgId}
          todos={todos.data ?? []}
          members={members.data ?? []}
          showDone={showDone}
          currentUserId={userId}
          isManager={isManager}
          onHandoff={setHandoff}
        />
      )}

      {handoff && (
        <HandoffModal
          todo={handoff}
          ownerName={handoffOwner}
          onClose={() => setHandoff(null)}
          onDone={refresh}
        />
      )}
    </>
  );
}
