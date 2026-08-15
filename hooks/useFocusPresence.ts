'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acquirePresenceChannel,
  releasePresenceChannel,
  schedulePresenceSubscribe,
} from './useOrgBoard';

export interface FocusUser {
  userId: string;
  expiresAt: number;
}

interface FocusPayload {
  userId: string;
  todoId: string;
  at: number;
}

interface UnfocusPayload {
  userId: string;
  todoId: string;
}

/**
 * 표시가 유지되는 최대 시간 — 하트비트 두 번을 놓쳐도(네트워크 지터, 탭을 그냥 닫음)
 * 버티다가 이 시간 뒤엔 사라진다. 하트비트 주기(HEARTBEAT_MS)보다 넉넉히 잡아야
 * 정상적으로 계속 보고 있는 중에도 깜빡이지 않는다.
 */
const TTL_MS = 9000;
/**
 * 펼쳐 둔 동안 계속 재전송하는 주기.
 * 타이핑은 몇 초 안에 끝나는 버스트라 최초 1회 + 정지 이벤트로 충분했지만,
 * 포커스는 사람이 몇 분씩 카드를 열어 두고 메모를 읽을 수 있어서
 * 살아있는 동안 계속 갱신해야 TTL로 곧 사라지지 않는다.
 */
const HEARTBEAT_MS = 4000;

/**
 * 같은 조직의 다른 멤버가 지금 이 할 일 카드를 펼쳐서 보고 있음을 실시간으로 주고받는다.
 * `presence-${orgId}` 채널을 useOrgPresence·useTypingPresence와 공유한다
 * (useOrgBoard.ts의 acquire/release/schedule).
 */
export function useFocusPresence(orgId: string | null, userId: string | null) {
  const [focusByTodoId, setFocusByTodoId] = useState<Map<string, FocusUser[]>>(new Map());
  const channelRef = useRef<ReturnType<typeof acquirePresenceChannel> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const focusedTodoId = useRef<string | null>(null);

  const upsert = useCallback((entry: FocusUser, todoId: string) => {
    setFocusByTodoId(prev => {
      const next = new Map(prev);
      const list = (next.get(todoId) ?? []).filter(u => u.userId !== entry.userId);
      list.push(entry);
      next.set(todoId, list);
      return next;
    });
  }, []);

  const remove = useCallback((todoId: string, forUserId: string) => {
    setFocusByTodoId(prev => {
      const list = prev.get(todoId);
      if (!list) return prev;
      const filtered = list.filter(u => u.userId !== forUserId);
      const next = new Map(prev);
      if (filtered.length > 0) next.set(todoId, filtered);
      else next.delete(todoId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!orgId || !userId) return;
    const channel = acquirePresenceChannel(orgId, userId);
    channelRef.current = channel;

    channel.on('broadcast', { event: 'focus' }, ({ payload }: { payload: FocusPayload }) => {
      if (payload.userId === userId) return; // 본인 이벤트는 무시
      upsert({ userId: payload.userId, expiresAt: Date.now() + TTL_MS }, payload.todoId);
    });

    channel.on('broadcast', { event: 'unfocus' }, ({ payload }: { payload: UnfocusPayload }) => {
      if (payload.userId === userId) return;
      remove(payload.todoId, payload.userId);
    });

    schedulePresenceSubscribe(orgId, () => {});

    // 하트비트를 못 받는 경우(탭을 그냥 닫음 등)를 대비한 TTL 청소
    const sweep = setInterval(() => {
      const now = Date.now();
      setFocusByTodoId(prev => {
        let changed = false;
        const next = new Map<string, FocusUser[]>();
        prev.forEach((list, todoId) => {
          const alive = list.filter(u => u.expiresAt > now);
          if (alive.length !== list.length) changed = true;
          if (alive.length > 0) next.set(todoId, alive);
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      clearInterval(sweep);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      channelRef.current = null;
      releasePresenceChannel(orgId);
    };
  }, [orgId, userId, upsert, remove]);

  const send = useCallback(
    (event: 'focus' | 'unfocus', todoId: string) => {
      const channel = channelRef.current;
      if (!channel || !userId) return;
      channel.send({
        type: 'broadcast',
        event,
        payload:
          event === 'focus'
            ? ({ userId, todoId, at: Date.now() } satisfies FocusPayload)
            : ({ userId, todoId } satisfies UnfocusPayload),
      });
    },
    [userId]
  );

  const broadcastFocus = useCallback(
    (todoId: string) => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      focusedTodoId.current = todoId;
      send('focus', todoId);
      heartbeatTimer.current = setInterval(() => send('focus', todoId), HEARTBEAT_MS);
    },
    [send]
  );

  const broadcastUnfocus = useCallback(
    (todoId: string) => {
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = null;
      if (focusedTodoId.current === todoId) focusedTodoId.current = null;
      send('unfocus', todoId);
    },
    [send]
  );

  return { focusByTodoId, broadcastFocus, broadcastUnfocus };
}
