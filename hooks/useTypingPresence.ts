'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acquirePresenceChannel,
  releasePresenceChannel,
  schedulePresenceSubscribe,
} from './useOrgBoard';

export type TypingField = 'title' | 'note';

export interface TypingUser {
  userId: string;
  displayName: string;
  field: TypingField;
  expiresAt: number;
}

interface TypingPayload {
  userId: string;
  displayName: string;
  todoId: string;
  field: TypingField;
  at: number;
}

interface StoppedTypingPayload {
  userId: string;
  todoId: string;
  field: TypingField;
}

/** 표시가 유지되는 최대 시간 — 정지 이벤트를 못 받아도(탭을 그냥 닫아도) 이 시간 뒤엔 사라진다 */
const TTL_MS = 4000;
/** 연속 타이핑 중 최대 전송 빈도 */
const THROTTLE_MS = 1500;
/** 입력이 멈췄다고 판단하는 시간 — 이 시간 동안 추가 입력이 없으면 정지 이벤트를 보낸다 */
const STOP_DEBOUNCE_MS = 2000;

/**
 * 같은 조직의 다른 멤버가 할 일 제목/메모를 입력 중임을 실시간으로 주고받는다.
 * `presence-${orgId}` 채널을 useOrgPresence와 공유한다(useOrgBoard.ts의 acquire/release/schedule).
 */
export function useTypingPresence(
  orgId: string | null,
  userId: string | null,
  displayName: string | null
) {
  const [typingByTodoId, setTypingByTodoId] = useState<Map<string, TypingUser[]>>(new Map());
  const channelRef = useRef<ReturnType<typeof acquirePresenceChannel> | null>(null);
  // todoId:field -> 마지막 전송 시각·정지 타이머
  const sendState = useRef(
    new Map<string, { lastSentAt: number; stopTimer: ReturnType<typeof setTimeout> | null }>()
  );

  const upsert = useCallback((entry: TypingUser, todoId: string) => {
    setTypingByTodoId(prev => {
      const next = new Map(prev);
      const list = (next.get(todoId) ?? []).filter(
        u => !(u.userId === entry.userId && u.field === entry.field)
      );
      list.push(entry);
      next.set(todoId, list);
      return next;
    });
  }, []);

  const remove = useCallback((todoId: string, forUserId: string, field: TypingField) => {
    setTypingByTodoId(prev => {
      const list = prev.get(todoId);
      if (!list) return prev;
      const filtered = list.filter(u => !(u.userId === forUserId && u.field === field));
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
    // cleanup에서 쓸 값을 이펙트 시작 시점에 미리 잡아 둔다 — ref.current는
    // cleanup이 실행되는 시점엔 이미 다른 값으로 바뀌어 있을 수 있다.
    const timers = sendState.current;

    channel.on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
      if (payload.userId === userId) return; // 본인 이벤트는 무시
      upsert(
        {
          userId: payload.userId,
          displayName: payload.displayName,
          field: payload.field,
          expiresAt: Date.now() + TTL_MS,
        },
        payload.todoId
      );
    });

    channel.on(
      'broadcast',
      { event: 'stopped_typing' },
      ({ payload }: { payload: StoppedTypingPayload }) => {
        if (payload.userId === userId) return;
        remove(payload.todoId, payload.userId, payload.field);
      }
    );

    schedulePresenceSubscribe(orgId, () => {});

    // 정지 이벤트를 못 받는 경우(탭을 그냥 닫음 등)를 대비한 TTL 청소
    const sweep = setInterval(() => {
      const now = Date.now();
      setTypingByTodoId(prev => {
        let changed = false;
        const next = new Map<string, TypingUser[]>();
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
      timers.forEach(s => {
        if (s.stopTimer) clearTimeout(s.stopTimer);
      });
      timers.clear();
      channelRef.current = null;
      releasePresenceChannel(orgId);
    };
  }, [orgId, userId, upsert, remove]);

  const broadcastTyping = useCallback(
    (todoId: string, field: TypingField) => {
      const channel = channelRef.current;
      if (!channel || !orgId || !userId) return;
      const key = `${todoId}:${field}`;
      const now = Date.now();
      const state = sendState.current.get(key) ?? { lastSentAt: 0, stopTimer: null };

      if (now - state.lastSentAt >= THROTTLE_MS) {
        state.lastSentAt = now;
        channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            userId,
            displayName: displayName ?? '',
            todoId,
            field,
            at: now,
          } satisfies TypingPayload,
        });
      }

      if (state.stopTimer) clearTimeout(state.stopTimer);
      state.stopTimer = setTimeout(() => {
        channel.send({
          type: 'broadcast',
          event: 'stopped_typing',
          payload: { userId, todoId, field } satisfies StoppedTypingPayload,
        });
        sendState.current.delete(key);
      }, STOP_DEBOUNCE_MS);

      sendState.current.set(key, state);
    },
    [orgId, userId, displayName]
  );

  return { typingByTodoId, broadcastTyping };
}
