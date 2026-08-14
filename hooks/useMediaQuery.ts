'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * 미디어 쿼리 일치 여부.
 * useEffect+setState 대신 외부 저장소 구독으로 읽어서 렌더 한 번에 확정되고,
 * 화면 회전·창 크기 변경에도 그대로 따라간다. 서버에서는 항상 false다.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
