'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { boardKeys, useBoardRealtime, useOrgMembers, useOrgPresence, useOrgTodos } from '@/hooks/useOrgBoard';
import { useApp } from '../OrgContext';
import { Button, Card, Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { Todo } from '@/types/db';
import MemberColumn from './MemberColumn';
import HandoffModal from './HandoffModal';

type ViewMode = 'spread' | 'focus';

export default function BoardClient() {
  const { activeOrgId, userId, orgs } = useApp();
  const queryClient = useQueryClient();

  const members = useOrgMembers(activeOrgId);
  const todos = useOrgTodos(activeOrgId);
  useBoardRealtime(activeOrgId);
  useOrgPresence(activeOrgId, userId);

  const [view, setView] = useState<ViewMode>('spread');
  const [focusIndex, setFocusIndex] = useState(0);
  const [showDone, setShowDone] = useState(false);
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

  function refresh() {
    if (activeOrgId) queryClient.invalidateQueries({ queryKey: boardKeys.todos(activeOrgId) });
  }

  if (orgs.length === 0) {
    return (
      <main className="mx-auto flex max-w-[520px] flex-col items-center px-6 py-20 text-center">
        <h1 className="text-heading-1 text-ink">아직 조직이 없습니다</h1>
        <p className="mt-2 text-body-sm text-ink-muted">
          조직을 만들어 팀원을 초대하거나, 받은 초대를 수락하세요.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/orgs/new">
            <Button size="lg">조직 만들기</Button>
          </Link>
          <Link href="/invites">
            <Button size="lg" variant="outline">
              받은 초대 확인
            </Button>
          </Link>
        </div>
      </main>
    );
  }

  const loading = members.isLoading || todos.isLoading;
  const error = members.error ?? todos.error;

  const focusMember = orderedMembers[Math.min(focusIndex, orderedMembers.length - 1)];
  const handoffOwner = handoff
    ? orderedMembers.find(m => m.user_id === handoff.owner_id)?.display_name ?? '팀원'
    : '';

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-5">
      <div className="flex flex-wrap items-center gap-2 pb-4">
        <h1 className="text-heading-2 text-ink">보드</h1>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowDone(v => !v)}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors',
              showDone
                ? 'border-hairline-strong bg-surface text-ink'
                : 'border-hairline bg-transparent text-ink-muted hover:text-ink'
            )}
          >
            완료 {showDone ? '보임' : '숨김'}
          </button>

          <div className="flex overflow-hidden rounded-lg border border-hairline">
            {(['spread', 'focus'] as ViewMode[]).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cn(
                  'px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  view === mode ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-muted'
                )}
              >
                {mode === 'spread' ? '펼쳐보기' : '한 명씩'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-ink-muted">
          <Spinner /> 불러오는 중…
        </div>
      )}

      {error && (
        <Card className="p-5 text-[14px] text-danger">
          {error instanceof Error ? error.message : '보드를 불러오지 못했습니다.'}
        </Card>
      )}

      {!loading && !error && view === 'spread' && (
        <div className="snap-board flex gap-3 overflow-x-auto pb-4">
          {orderedMembers.map(m => (
            <MemberColumn
              key={m.user_id}
              member={m}
              todos={todosByOwner.get(m.user_id) ?? []}
              orgId={activeOrgId!}
              currentUserId={userId}
              members={orderedMembers}
              showDone={showDone}
              onMutated={refresh}
              onHandoff={setHandoff}
            />
          ))}
        </div>
      )}

      {!loading && !error && view === 'focus' && focusMember && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full max-w-[420px] items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocusIndex(i => Math.max(0, i - 1))}
              disabled={focusIndex === 0}
            >
              ← 이전
            </Button>
            <span className="text-caption text-ink-muted">
              {Math.min(focusIndex, orderedMembers.length - 1) + 1} / {orderedMembers.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocusIndex(i => Math.min(orderedMembers.length - 1, i + 1))}
              disabled={focusIndex >= orderedMembers.length - 1}
            >
              다음 →
            </Button>
          </div>

          <MemberColumn
            member={focusMember}
            todos={todosByOwner.get(focusMember.user_id) ?? []}
            orgId={activeOrgId!}
            currentUserId={userId}
            members={orderedMembers}
            showDone={showDone}
            onMutated={refresh}
            onHandoff={setHandoff}
            className="w-full max-w-[420px]"
          />
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
