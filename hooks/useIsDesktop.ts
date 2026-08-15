'use client';

import { useSyncExternalStore } from 'react';

/** Tailwind의 `sm` 브레이크포인트와 맞춘다 */
const QUERY = '(min-width: 640px)';

// matchMedia도 React 밖의 값이다 — useEffect+setState로 흉내 내면 마운트 후 한 번 더
// 렌더가 돌고(react-hooks/set-state-in-effect가 막는 패턴) SSR과도 어긋난다.
// useSyncExternalStore로 서버 스냅샷(false)과 클라이언트 값을 분리한다.
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
