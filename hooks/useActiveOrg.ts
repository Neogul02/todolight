'use client';

import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'todolight_active_org';

/*
  서버(board/page.tsx)가 첫 화면에서 어느 조직 데이터를 미리 불러와 둘지 알아야 해서
  localStorage와 같은 값을 쿠키에도 미러링한다 — lib/locale-client.ts의 applyLocale과 같은 패턴.
  쿠키 자체가 진실은 아니다(진실은 여전히 localStorage/state) — 서버 prefetch용 힌트일 뿐이라
  틀려도(예: 나간 조직을 여전히 가리켜도) fetchOrgMembers 등의 멤버 검사가 막아 준다.
*/
function syncCookie(id: string) {
  document.cookie = `${STORAGE_KEY}=${id}; path=/; max-age=31536000; SameSite=Lax`;
}

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
  syncCookie(id);
  listeners.forEach(l => l());
}

/**
 * 마지막으로 보던 조직을 기억한다.
 * 저장값이 더 이상 유효하지 않으면(나갔거나 삭제됐거나) 첫 번째 조직으로 떨어뜨린다.
 */
export function useActiveOrg(orgIds: string[]): [string | null, (id: string) => void] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const activeId = stored && orgIds.includes(stored) ? stored : orgIds[0] ?? null;

  /*
    조직을 한 번도 안 바꾼 사용자(대부분)는 persist()가 안 불려서 쿠키가 영영 안 생긴다 —
    이 훅이 계산해 낸 activeId가 바뀔 때마다(최초 로드 포함) 쿠키를 맞춰 둬야 다음 로드부터
    서버 prefetch가 그 조직을 곧바로 겨냥할 수 있다.
  */
  useEffect(() => {
    if (activeId) syncCookie(activeId);
  }, [activeId]);

  return [activeId, persist];
}
