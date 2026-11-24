'use client';

import { useSyncExternalStore } from 'react';

/*
  화면 키보드가 가린 높이(px). 키보드가 없거나 데스크톱이면 0.

  iOS Safari는 `interactiveWidget: 'resizes-content'`를 따르지 않는다 — 키보드가 올라와도
  레이아웃 뷰포트는 그대로이고 `position: fixed; bottom: 0`인 시트는 키보드 **뒤에** 남는다.
  보이는 영역(visualViewport)과 창 높이의 차이가 곧 키보드 높이다.
  주소창이 접히며 생기는 몇 px 흔들림은 키보드로 치지 않는다(80px 미만은 0).
*/
function read(): number {
  const vv = window.visualViewport;
  if (!vv) return 0;
  const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop);
  return inset >= 80 ? inset : 0;
}

function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport;
  if (!vv) return () => {};
  vv.addEventListener('resize', onChange);
  vv.addEventListener('scroll', onChange);
  return () => {
    vv.removeEventListener('resize', onChange);
    vv.removeEventListener('scroll', onChange);
  };
}

export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, read, () => 0);
}
