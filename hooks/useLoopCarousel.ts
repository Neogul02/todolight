'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Slide<T> {
  key: string;
  item: T;
  /** 원본 배열에서의 위치 — 복제본도 원본과 같은 값을 가진다 */
  realIndex: number;
}

/** 스크롤 컨테이너 왼쪽 기준선(scroll-padding-left)에서 얼마나 떨어져 있는지 */
function offsetFromSnapLine(scroller: HTMLElement, el: HTMLElement): number {
  const pad = parseFloat(getComputedStyle(scroller).scrollPaddingLeft) || 0;
  return el.getBoundingClientRect().left - scroller.getBoundingClientRect().left - pad;
}

/**
 * 가로 스냅 스크롤을 순환시킨다.
 *
 * 앞뒤에 양 끝 항목의 복제본을 하나씩 덧대고, 스크롤이 멎었을 때 복제본 위에 있으면
 * 같은 내용의 진짜 항목 위치로 순간 이동시킨다. 사용자 눈에는 똑같은 화면이라 이동이 보이지 않고,
 * 첫 번째에서 왼쪽으로 밀면 마지막이, 마지막에서 오른쪽으로 밀면 첫 번째가 이어진다.
 *
 * 네이티브 스크롤을 그대로 쓰기 때문에 관성·스냅·컬럼 내부 세로 스크롤이 전부 살아 있다.
 * (드래그를 직접 구현하면 세로 스크롤과 충돌한다)
 */
export function useLoopCarousel<T>(
  items: T[],
  keyOf: (item: T) => string,
  enabled: boolean,
  /**
   * 이 값이 바뀌면 목록이 완전히 다른 것으로 갈렸다고 보고 첫 슬라이드로 다시 맞춘다.
   * 조직을 바꾸면 멤버가 통째로 달라지므로 내 컬럼부터 다시 보여야 한다.
   */
  resetKey?: string | null
) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<(HTMLElement | null)[]>([]);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positioned = useRef(false);
  const lastResetKey = useRef(resetKey);
  const [activeIndex, setActiveIndex] = useState(0);

  const loop = enabled && items.length > 1;
  const last = items.length - 1;

  const slides: Slide<T>[] = loop
    ? [
        { key: `clone-tail-${keyOf(items[last])}`, item: items[last], realIndex: last },
        ...items.map((item, i) => ({ key: keyOf(item), item, realIndex: i })),
        { key: `clone-head-${keyOf(items[0])}`, item: items[0], realIndex: 0 },
      ]
    : items.map((item, i) => ({ key: keyOf(item), item, realIndex: i }));

  /** 지금 스냅 기준선에 가장 가까운 슬라이드 (slides 기준 인덱스) */
  const nearestSlide = useCallback((): number => {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    let nearest = 0;
    let best = Infinity;
    nodeRefs.current.forEach((el, i) => {
      // 멤버가 줄면 예전 인덱스의 ref가 떨어져 나간 노드로 남는다.
      // 그런 노드의 getBoundingClientRect()는 전부 0이라 스냅 기준선에 가장 가깝다고
      // 잘못 뽑힐 수 있다 — 붙어 있는 노드만 본다.
      if (!el || !el.isConnected) return;
      const distance = Math.abs(offsetFromSnapLine(scroller, el));
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    return nearest;
  }, []);

  const jumpTo = useCallback((slideIndex: number, smooth: boolean) => {
    const scroller = scrollerRef.current;
    const el = nodeRefs.current[slideIndex];
    if (!scroller || !el) return;
    const delta = offsetFromSnapLine(scroller, el);
    if (smooth) scroller.scrollBy({ left: delta, behavior: 'smooth' });
    // scroll-behavior가 auto라 직접 대입하면 즉시 이동한다 — 복제본 되감기는 보이면 안 된다
    else scroller.scrollLeft += delta;
  }, []);

  const count = items.length;

  const onScroll = useCallback(() => {
    const index = nearestSlide();
    // 복제본을 앞에 하나 덧댔으므로 실제 인덱스는 한 칸 당겨서 계산한다
    setActiveIndex(loop ? (index - 1 + count) % count : index);

    if (!loop) return;
    // 관성 스크롤이 멎은 뒤에 되감아야 한다. 스크롤 도중에 옮기면 손가락과 화면이 어긋난다.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const settled = nearestSlide();
      if (settled === 0) jumpTo(count, false);
      else if (settled === count + 1) jumpTo(1, false);
    }, 120);
  }, [count, jumpTo, loop, nearestSlide]);

  // 복제본을 앞에 뒀으므로 처음 한 번은 두 번째 슬라이드(= 진짜 첫 번째)로 맞춰 줘야 한다.
  // 다만 멤버 수가 바뀔 때마다 되돌리면 안 된다 — 팀원이 한 명 들어왔다고 해서
  // 남의 컬럼을 보던 사람을 자기 컬럼으로 끌고 오면 자리를 잃는다.
  useEffect(() => {
    // 슬라이드 수가 줄었을 때 남는 뒤쪽 ref를 잘라 낸다
    nodeRefs.current.length = loop ? count + 2 : count;

    // 조직이 바뀌면 목록이 통째로 갈리므로 위치를 처음부터 다시 잡는다
    if (lastResetKey.current !== resetKey) {
      lastResetKey.current = resetKey;
      positioned.current = false;
    }

    if (!loop) {
      positioned.current = false;
      return;
    }
    if (positioned.current) return;

    const id = requestAnimationFrame(() => {
      jumpTo(1, false);
      positioned.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [loop, count, jumpTo, resetKey]);

  useEffect(() => {
    return () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, []);

  /** 원본 인덱스로 이동 (멤버 칩 탭) */
  const goTo = useCallback(
    (realIndex: number) => jumpTo(loop ? realIndex + 1 : realIndex, true),
    [jumpTo, loop]
  );

  const registerNode = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      nodeRefs.current[index] = el;
    },
    []
  );

  return { scrollerRef, slides, activeIndex, onScroll, goTo, registerNode };
}
