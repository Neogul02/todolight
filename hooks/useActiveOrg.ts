'use client';

import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'todolight_active_org';

// localStorage는 React 밖의 외부 저장소다 — useEffect+setState로 흉내 내면 렌더가 한 번 더 돌고
// SSR과 값이 어긋난다. useSyncExternalStore로 서버 스냅샷(null)과 클라이언트 값을 분리한다.
const listeners = new Set<() => void>();
let cached: string | null | undefined;

function getSnapshot(): string | null {
  if (cached === undefined) cached = localStorage.getItem(STORAGE_KEY);
  return cached;
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function persist(id: string) {
  cached = id;
  localStorage.setItem(STORAGE_KEY, id);
  listeners.forEach(l => l());
}

/**
 * 마지막으로 보던 조직을 기억한다.
 * 저장값이 더 이상 유효하지 않으면(나갔거나 삭제됐거나) 첫 번째 조직으로 떨어뜨린다.
 */
export function useActiveOrg(orgIds: string[]): [string | null, (id: string) => void] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeId = stored && orgIds.includes(stored) ? stored : orgIds[0] ?? null;
  return [activeId, persist];
}
