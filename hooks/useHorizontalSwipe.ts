'use client';

import { useCallback, useEffect, useState } from 'react';

/** 이만큼 옆으로 밀어야 넘긴 것으로 친다. 너무 작으면 탭이 스와이프로 오인된다 */
const SWIPE_THRESHOLD = 56;

/**
 * 좌우로 밀어 넘기기. 손가락과 마우스 둘 다 받는다.
 *
 * 스크롤 컨테이너가 아니라 그냥 영역이라 네이티브 스크롤을 쓸 수 없다 —
 * 포인터 이동을 직접 재서 임계값을 넘으면 한 번 넘긴다.
 * 세로로 더 많이 움직였으면 페이지를 스크롤하려는 것이므로 손을 뗀다.
 */
export function useHorizontalSwipe(onSwipe: (direction: -1 | 1) => void) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => setEl(node), []);

  useEffect(() => {
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;
    let swiped = false;
    let pointerId: number | null = null;

    /*
      마우스는 터치와 달리 포인터가 암묵적으로 캡처되지 않는다. 캡처 없이 손을 빨리
      움직이면 커서가 이 영역(달력 폭만큼) 밖으로 나가는 순간 이후의 pointermove는
      커서 아래 다른 엘리먼트로 튀어 버려서 리스너에 닿지 않고, 스와이프가 끊긴다 —
      직접 캡처해서 커서가 지금 어디 있든 계속 이 엘리먼트가 받게 한다.
    */
    const release = () => {
      tracking = false;
      if (pointerId !== null && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      pointerId = null;
      el.style.cursor = '';
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracking = true;
      swiped = false;
      startX = e.clientX;
      startY = e.clientY;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'mouse') el.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      // 세로가 더 크면 페이지를 스크롤하려는 것이다 — 이번 제스처는 넘긴다
      if (Math.abs(dy) > Math.abs(dx)) {
        release();
        return;
      }
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;

      swiped = true;
      release();
      // 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
      onSwipe(dx < 0 ? 1 : -1);
    };

    const onPointerUp = () => release();

    /*
      민 자리에 날짜 칸이 있으면 그게 눌린다. 달을 넘겼을 뿐인데 엉뚱한 날이 선택되면 곤란하다 —
      capture 단계에서 그 클릭 한 번을 삼킨다.
    */
    const onClickCapture = (e: MouseEvent) => {
      if (!swiped) return;
      e.stopPropagation();
      e.preventDefault();
      swiped = false;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [el, onSwipe]);

  return ref;
}
