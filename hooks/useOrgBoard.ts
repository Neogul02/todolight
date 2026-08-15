'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getRealtimeClient } from '@/lib/supabase-realtime';
import { isTodoPending } from '@/lib/pending-todos';
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

            /*
              이 행에 대한 내 요청이 아직 날아다니는 중이면 건너뛴다.
              실시간 페이로드는 행 전체를 담고 있어서, 내가 방금 낙관적으로 바꾼 필드까지
              커밋 이전 값으로 되돌린다 — 제목을 고치는 도중 체크를 누르면 체크가
              저 혼자 풀리는 것처럼 보인다.
              cancelQueries는 react-query의 fetch만 막을 뿐 이 경로는 막지 못한다.
              건너뛴 변경은 뮤테이션이 끝날 때 invalidate로 다시 맞춰진다.
            */
            if (isTodoPending(row.id)) return prev;
            // 소프트 삭제는 DELETE가 아니라 deleted_at을 찍는 UPDATE로 온다
            if (row.deleted_at) return prev.filter(t => t.id !== row.id);

            const existing = prev.find(t => t.id === row.id);
            // 메모·참여자는 이 페이로드에 없다 — 기존 캐시 값을 유지한다.
            const merged: Todo = {
              ...row,
              notes: existing?.notes ?? [],
              participant_ids: existing?.participant_ids ?? [],
            };
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todo_participants', filter: `org_id=eq.${orgId}` },
        () => {
          // 참여자 이름·아바타는 members 목록에서 찾아 쓰지만, "누가 참여 중인지" 자체는
          // todos 캐시(participant_ids)에 있어서 다시 읽어야 한다.
          queryClient.invalidateQueries({ queryKey: key });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}

type PresenceChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  subscribeScheduled: boolean;
};

/**
 * `presence-${orgId}` 채널은 접속 표시(useOrgPresence)와 입력 중 표시(useTypingPresence)가
 * 함께 쓴다 — 채널을 두 개 열지 않기 위해서다.
 *
 * realtime-js는 subscribe() 이후에 .on()을 등록하면 던진다("cannot add callbacks after
 * subscribe()"). 두 훅이 각자의 이펙트에서 리스너를 등록하므로, 채널을 만든 직후 곧바로
 * 구독하지 않고 마이크로태스크까지 미룬다 — 같은 렌더 커밋에서 등록되는 두 훅의 리스너가
 * 전부 실린 뒤에야 한 번만 subscribe() 한다. queueMicrotask는 현재 동기 실행이 끝난 뒤,
 * 두 훅의 이펙트가 모두 실행된 다음에 돈다(호출 순서에 상관없이 안전하다).
 */
const presenceChannels = new Map<string, PresenceChannelEntry>();

function acquirePresenceChannel(orgId: string, userId: string): RealtimeChannel {
  let entry = presenceChannels.get(orgId);
  if (!entry) {
    const channel = getRealtimeClient().channel(`presence-${orgId}`, {
      config: { presence: { key: userId } },
    });
    entry = { channel, refCount: 0, subscribeScheduled: false };
    presenceChannels.set(orgId, entry);
  }
  entry.refCount++;
  return entry.channel;
}

function releasePresenceChannel(orgId: string) {
  const entry = presenceChannels.get(orgId);
  if (!entry) return;
  entry.refCount--;
  if (entry.refCount <= 0) {
    presenceChannels.delete(orgId);
    getRealtimeClient().removeChannel(entry.channel);
  }
}

/** 채널을 구독한다(한 번만). 이미 예약돼 있으면 아무것도 하지 않는다. */
function schedulePresenceSubscribe(orgId: string, onSubscribed: (channel: RealtimeChannel) => void) {
  const entry = presenceChannels.get(orgId);
  if (!entry || entry.subscribeScheduled) return;
  entry.subscribeScheduled = true;
  queueMicrotask(() => {
    // 그 사이 채널이 교체·정리됐으면(예: 빠른 조직 전환) 건너뛴다
    if (presenceChannels.get(orgId) !== entry) return;
    entry.channel.subscribe(status => {
      if (status === 'SUBSCRIBED') onSubscribed(entry.channel);
    });
  });
}

/** 다른 멤버의 접속 여부 표시용 Presence */
export function useOrgPresence(orgId: string | null, userId: string | null) {
  useEffect(() => {
    if (!orgId || !userId) return;
    acquirePresenceChannel(orgId, userId);
    schedulePresenceSubscribe(orgId, channel => channel.track({ at: new Date().toISOString() }));
    return () => releasePresenceChannel(orgId);
  }, [orgId, userId]);
}

export { acquirePresenceChannel, releasePresenceChannel, schedulePresenceSubscribe };
