'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeClient } from '@/lib/supabase-realtime';
import { fetchOrgMembers } from '@/app/actions/orgs';
import { fetchOrgTodos } from '@/app/actions/todos';
import type { MemberSummary, Todo } from '@/types/db';

export const boardKeys = {
  todos: (orgId: string) => ['todos', orgId] as const,
  members: (orgId: string) => ['members', orgId] as const,
};

export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: boardKeys.members(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async (): Promise<MemberSummary[]> => {
      const res = await fetchOrgMembers(orgId!);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });
}

export function useOrgTodos(orgId: string | null) {
  return useQuery({
    queryKey: boardKeys.todos(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async (): Promise<Todo[]> => {
      const res = await fetchOrgTodos(orgId!);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
  });
}

/**
 * 조직의 todos / todo_notes 변경을 웹소켓으로 받아 캐시에 반영한다.
 * todos는 행 단위로 직접 병합하고(즉시 반영), notes는 조인이 필요해서 refetch로 처리한다.
 */
export function useBoardRealtime(orgId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const supabase = getRealtimeClient();
    const key = boardKeys.todos(orgId);

    const channel = supabase
      .channel(`board-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos', filter: `org_id=eq.${orgId}` },
        payload => {
          queryClient.setQueryData<Todo[]>(key, prev => {
            if (!prev) return prev;

            if (payload.eventType === 'DELETE') {
              const gone = (payload.old as { id?: string })?.id;
              return gone ? prev.filter(t => t.id !== gone) : prev;
            }

            const row = payload.new as Todo;
            // 소프트 삭제는 DELETE가 아니라 deleted_at을 찍는 UPDATE로 온다
            if (row.deleted_at) return prev.filter(t => t.id !== row.id);

            const existing = prev.find(t => t.id === row.id);
            // 메모는 이 페이로드에 없다 — 기존 캐시의 notes를 유지한다.
            const merged: Todo = { ...row, notes: existing?.notes ?? [] };
            const next = existing
              ? prev.map(t => (t.id === row.id ? merged : t))
              : [...prev, merged];
            return next.sort((a, b) =>
              a.position === b.position
                ? a.created_at.localeCompare(b.created_at)
                : a.position - b.position
            );
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todo_notes' },
        () => {
          // 메모는 작성자 이름 조인이 필요해서 서버에서 다시 읽는다.
          queryClient.invalidateQueries({ queryKey: key });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}

/** 다른 멤버의 접속 여부 표시용 Presence */
export function useOrgPresence(orgId: string | null, userId: string | null) {
  useEffect(() => {
    if (!orgId || !userId) return;
    const supabase = getRealtimeClient();
    const channel = supabase.channel(`presence-${orgId}`, {
      config: { presence: { key: userId } },
    });
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') channel.track({ at: new Date().toISOString() });
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, userId]);
}
