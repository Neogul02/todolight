'use client';

import { useTranslations } from 'next-intl';
import { useOrgMembers, useOrgTodos } from '@/hooks/useOrgBoard';
import { useOrgEvents } from '@/hooks/useOrgEvents';
import { useApp } from '../OrgContext';
import { Card } from '@/components/ui';
import type { Todo } from '@/types/db';
import { CalendarView } from './CalendarView';
import { CalendarSkeleton } from './CalendarSkeleton';

/**
 * 달력 패널 — 조직 전체를 마감일·일정 기준으로 훑는다.
 *
 * 보드와 나란한 목적지이지 보드 안의 뷰가 아니다. todos·members 쿼리 키는 보드와 같아서
 * (hooks/useOrgBoard) 보드를 먼저 봤다면 그 캐시를 그대로 물려받는다 — 조직만 같으면
 * 어느 패널에서 먼저 불렀든 데이터가 데워져 있다.
 *
 * 실시간 구독과 대신 처리 시트는 ViewPager가 갖는다 — 보드 패널과 동시에 살아 있어서
 * 여기서도 열면 같은 채널이 두 번 열리고 시트가 두 벌이 된다.
 */
export default function CalendarClient({ onHandoff }: { onHandoff: (todo: Todo) => void }) {
  const { activeOrgId, userId, isManager, profile } = useApp();
  const t = useTranslations('board');

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  const events = useOrgEvents(activeOrgId);

  const showDone = profile?.show_done ?? true;

  // todos·members는 보드에서 이미 캐시돼 있을 때가 많지만, 달력부터 열면 처음 요청이다.
  const loading = members.isLoading || todos.isLoading || events.isLoading;
  const error = members.error ?? todos.error ?? events.error;

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
          onHandoff={onHandoff}
        />
      )}
    </>
  );
}
