'use client';

import { useSyncExternalStore } from 'react';

/** 구독할 외부 값이 없다 — 서버/클라이언트 스냅샷이 다르다는 것만 쓴다 */
function subscribe(): () => void {
  return () => {};
}

/**
 * 클라이언트에서 하이드레이션이 끝났는지.
 *
 * `document`가 있어야만 할 수 있는 일(포털)에 쓴다. `useEffect` + `setState`로 흉내 내면
 * `react-hooks/set-state-in-effect`에 걸린다 — React 밖의 값은 useSyncExternalStore로 읽는다
 * (hooks/useIsDesktop.ts와 같은 패턴).
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
