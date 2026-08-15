'use client';

import { useEffect } from 'react';

/**
 * ref가 가리키는 요소 바깥을 클릭하면 onOutside를 부른다.
 * enabled가 false면 리스너를 아예 붙이지 않는다(예: 카드가 닫혀 있을 땐 검사할 필요가 없다).
 *
 * mousedown 기준으로 판정한다 — React의 onClick(사실상 mouseup 기반 합성 이벤트)보다
 * 먼저 발생하므로, 다른 카드 제목을 클릭한 경우 "바깥 클릭으로 닫힘" → "그 클릭의 onClick으로
 * 새 카드 열림" 순서가 자연스럽게 이어진다(레이스 없음).
 */
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onOutside: () => void,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    function handlePointerDown(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      onOutside();
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [ref, onOutside, enabled]);
}
