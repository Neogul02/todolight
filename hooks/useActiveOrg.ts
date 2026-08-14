'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'todolight_active_org';

/**
 * 마지막으로 보던 조직을 기억한다.
 * 조직 목록이 로드되면 저장값이 아직 유효한지 확인하고, 아니면 첫 번째 조직으로 떨어뜨린다.
 */
export function useActiveOrg(orgIds: string[]): [string | null, (id: string) => void] {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (orgIds.length === 0) {
      setActiveId(null);
      return;
    }
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    setActiveId(prev => {
      const candidate = prev ?? stored;
      return candidate && orgIds.includes(candidate) ? candidate : orgIds[0];
    });
  }, [orgIds]);

  const select = (id: string) => {
    setActiveId(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  return [activeId, select];
}
