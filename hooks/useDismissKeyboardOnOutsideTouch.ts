'use client';

import { useEffect } from 'react';

const FIELD = 'input, textarea, select, [contenteditable="true"]';

/**
 * 터치로 입력칸 밖을 누르면 키보드를 내린다 — 키보드는 적는 동안에만 있어야 한다.
 *
 * iOS Safari는 포커스할 수 없는 곳을 눌러도 입력칸의 포커스를 풀지 않아서, 할 일을 적다가
 * 카드를 눌러도 키보드가 화면 절반을 덮은 채로 남았다. iOS 앱(KeyboardDismiss.swift)과 같은 규칙:
 * - 다른 입력칸을 누르면 그대로 옮겨 간다(내리지 않는다)
 * - 지금 칸과 **같은 폼** 안(「추가」·메모 보내기 버튼)은 그 칸의 일부다 — 거기서 내리면
 *   보내고 나서 포커스를 다시 잡느라 키보드가 깜빡인다
 * 마우스에는 화면 키보드가 없으니 터치·펜만 본다.
 */
export function useDismissKeyboardOnOutsideTouch() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !active.matches(FIELD)) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(FIELD)) return;
      const form = active.closest('form');
      if (form && form.contains(target)) return;
      active.blur();
    }
    document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);
}
