'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getRealtimeClient } from '@/lib/supabase-realtime';
import { isTodoPending } from '@/lib/pending-todos';
import { fetchOrgMembers } from '@/app/actions/orgs';
import { fetchOrgTodos } from '@/app/actions/todos';
import { boardKeys } from '@/lib/query-keys';
import type { MemberSummary, Todo } from '@/types/db';

export { boardKeys };

/*
  둘 다 staleTime을 짧게 두고 refetchOnWindowFocus·refetchOnReconnect를 켠다
  (전역 QueryClient 기본값은 refetchOnWindowFocus: false).

  실시간 채널이 웹소켓으로 최신 상태를 밀어주지만, 모바일에서 앱을 오래 백그라운드에
  두면 그 채널이 조용히 끊긴 채로 돌아올 수 있다 — AppShell의 my-orgs 쿼리를 고칠 때와
  같은 문제다. 포커스가 돌아올 때(visibilitychange) 이 안전망이 한 번 더 불러와 준다.
  staleTime을 전역 기본값(60초, app/providers.tsx)보다 짧은 30초로 낮춘 이유는 그 반대다 —
  포커스가 돌아왔을 때 반드시 재조회가 걸리게 하려는 쪽이다. 60초 그대로 두면 방금 전에
  포커스를 잃었다 돌아온 흔한 경우에 재조회가 걸리지 않는다.
*/
export function useOrgMembers(orgId: string | null) {
  return useQuery({
    queryKey: boardKeys.members(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async (): Promise<MemberSummary[]> => {
      const res = await fetchOrgMembers(orgId!);
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

export function useOrgTodos(orgId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: boardKeys.todos(orgId ?? ''),
    enabled: !!orgId,
    queryFn: async (): Promise<Todo[]> => {
      const res = await fetchOrgTodos(orgId!);
      if (!res.success) throw new Error(res.error);
      /*
        한 번의 응답에서 두 캐시를 채운다.

        서버는 할 일과 "주인별 완료 총 개수"를 함께 준다(같은 쿼리 패스라 개수는 공짜다).
        그런데 이 훅의 캐시는 `Todo[]`여야 한다 — 실시간 병합과 낙관적 반영이 전부 그
        배열을 직접 주무르고 있어서, 객체로 바꾸면 앱에서 제일 예민한 코드가 통째로 흔들린다.
        개수만 옆 키로 흘려 둔다.
      */
      queryClient.setQueryData(boardKeys.doneTotals(orgId!), res.data.doneTotals);
      return res.data.todos;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}

/**
 * 주인별 완료 할 일 **총** 개수 — 상한(최근 20개)에 걸려 안 실려 온 것까지 포함한다.
 *
 * `useOrgTodos`가 채워 두는 값이라 여기서는 읽기만 한다(`queryFn`이 없다).
 * 아직 안 읽혔으면 빈 객체다 — 화면은 그때 받은 개수만 말하면 되고, 곧 채워진다.
 */
export function useOrgDoneTotals(orgId: string | null): Record<string, number> {
  const { data } = useQuery<Record<string, number>>({
    queryKey: boardKeys.doneTotals(orgId ?? ''),
    /*
      **스스로 읽지 않는다.** 이 값은 `useOrgTodos`의 응답에 함께 실려 오므로 여기서 또
      부르면 같은 것을 두 번 읽는다. `enabled: false`여도 useQuery는 이 키의 캐시를
      구독하므로, 저쪽이 `setQueryData`로 채우는 순간 이 컴포넌트가 다시 그려진다.
      queryFn을 두는 건 혹시라도 불릴 경우 조용히 빈 값으로 덮지 않게 하려는 것이다.
    */
    enabled: false,
    queryFn: () => {
      throw new Error('useOrgDoneTotals는 스스로 조회하지 않는다 — useOrgTodos가 채운다');
    },
  });
  /*
    실시간으로 남이 할 일을 완료하면 `todos` 캐시는 병합으로 즉시 바뀌지만 이 값은 그대로다
    — 다음 invalidate나 포커스 재조회 때 맞춰진다. 머리의 요약 숫자가 잠깐 하나 적을 뿐이라
    실시간 페이로드마다 여기까지 손대며 어긋날 자리를 늘릴 값이 아니다.
  */
  return data ?? {};
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
