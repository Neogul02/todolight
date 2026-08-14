'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** 스크롤 컨테이너 왼쪽 기준선(scroll-padding-left)에서 얼마나 떨어져 있는지 */
function offsetFromSnapLine(scroller: HTMLElement, el: HTMLElement): number {
  const pad = parseFloat(getComputedStyle(scroller).scrollPaddingLeft) || 0;
  return el.getBoundingClientRect().left - scroller.getBoundingClientRect().left - pad;
}

/** 드래그로 인정할 최소 이동 거리. 이보다 작으면 그냥 클릭이다 */
const DRAG_THRESHOLD = 4;

/**
 * 가로 스냅 캐러셀.
 *
 * 터치에서는 네이티브 스크롤이 이미 좋다 — 관성·스냅·컬럼 내부 세로 스크롤이 전부 공짜다.
 * 마우스에는 그런 게 없어서 드래그를 직접 붙인다. 데스크톱에서 컬럼을 옮기려면
 * 가로 스크롤바를 찾거나 shift+휠을 눌러야 했다.
 */
export function useCarousel(count: number, resetKey?: string | null) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  /*
    스크롤러 DOM을 state로도 들고 있는다.
    보드는 뷰 전환 애니메이션이 끝난 뒤에야 마운트되기 때문에, ref만 보고 이펙트를 걸면
    첫 실행 때 null이라 드래그 리스너가 영영 붙지 않는다. state로 두면 노드가 붙는 순간
    이펙트가 다시 돈다.
  */
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const setScrollerRef = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScrollerEl(el);
  }, []);
  const nodeRefs = useRef<(HTMLElement | null)[]>([]);
  const positioned = useRef(false);
  const lastResetKey = useRef(resetKey);
  const [activeIndex, setActiveIndex] = useState(0);

  /** 지금 스냅 기준선에 가장 가까운 슬라이드 */
  const nearestIndex = useCallback((): number => {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    let nearest = 0;
    let best = Infinity;
    nodeRefs.current.forEach((el, i) => {
      // 멤버가 줄면 예전 인덱스의 ref가 떨어져 나간 노드로 남는다.
      // 그런 노드의 좌표는 전부 0이라 기준선에 가장 가깝다고 잘못 뽑힌다.
      if (!el || !el.isConnected) return;
      const distance = Math.abs(offsetFromSnapLine(scroller, el));
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    return nearest;
  }, []);

  /** 이동에 성공했으면 true. 아직 DOM에 붙지 않았으면 false */
  const scrollToIndex = useCallback((index: number, smooth: boolean): boolean => {
    const scroller = scrollerRef.current;
    const el = nodeRefs.current[index];
    if (!scroller || !el) return false;
    const delta = offsetFromSnapLine(scroller, el);
    if (smooth) scroller.scrollBy({ left: delta, behavior: 'smooth' });
    else scroller.scrollLeft += delta;
    return true;
  }, []);

  const onScroll = useCallback(() => setActiveIndex(nearestIndex()), [nearestIndex]);

  /*
    resetKey(조직·뷰)가 바뀌면 첫 컬럼(= 내 할 일)으로 돌아간다.
    멤버 수가 바뀔 때는 되돌리지 않는다 — 팀원이 한 명 들어왔다고 남의 컬럼을 보던 사람을
    끌고 오면 자리를 잃는다.

    한 번에 성공한다고 가정하면 안 된다. 뷰 전환이 AnimatePresence mode="wait"라
    이전 뷰의 exit 애니메이션이 끝나야 컬럼이 DOM에 붙는다. 그전에 시도하면 조용히 실패하는데,
    실패를 성공으로 치고 positioned를 세우면 스크롤이 0에 남아 엉뚱한 자리에서 시작한다.
  */
  useEffect(() => {
    nodeRefs.current.length = count;

    if (lastResetKey.current !== resetKey) {
      lastResetKey.current = resetKey;
      positioned.current = false;
    }
    if (positioned.current || count === 0) return;

    let raf = 0;
    let frames = 0;
    const attempt = () => {
      if (scrollToIndex(0, false)) {
        positioned.current = true;
        return;
      }
      // 전환 애니메이션(0.2초 ≈ 12프레임)을 넉넉히 덮는다
      if (++frames < 40) raf = requestAnimationFrame(attempt);
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [count, resetKey, scrollToIndex, scrollerEl]);

  // ── 마우스 드래그로 밀기 ──
  useEffect(() => {
    const scroller = scrollerEl;
    if (!scroller) return;

    let startX = 0;
    let startLeft = 0;
    let pressed = false;
    let dragged = false;

    const onPointerDown = (e: PointerEvent) => {
      // 터치·펜은 네이티브 스크롤이 더 낫다. 왼쪽 버튼만 받는다.
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      // 입력 요소 위에서 시작하면 커서 놓기·텍스트 선택을 방해한다
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;

      pressed = true;
      dragged = false;
      startX = e.clientX;
      startLeft = scroller.scrollLeft;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pressed) return;
      const dx = e.clientX - startX;

      if (!dragged) {
        if (Math.abs(dx) < DRAG_THRESHOLD) return;
        dragged = true;
        scroller.setPointerCapture(e.pointerId);
        // 스냅이 켜진 채로는 드래그가 칸마다 걸려서 손을 따라오지 않는다
        scroller.style.scrollSnapType = 'none';
        scroller.style.cursor = 'grabbing';
        // 드래그하는 동안만 선택을 막는다. 상시로 걸면 할 일 제목·메모를 복사할 수 없다
        scroller.style.userSelect = 'none';
      }

      scroller.scrollLeft = startLeft - dx;
      e.preventDefault();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pressed) return;
      pressed = false;
      if (!dragged) return;

      if (scroller.hasPointerCapture(e.pointerId)) scroller.releasePointerCapture(e.pointerId);
      scroller.style.scrollSnapType = '';
      scroller.style.cursor = '';
      scroller.style.userSelect = '';
      // 스냅을 되돌리는 것만으로는 브라우저가 항상 붙여 주지 않는다 — 직접 가장 가까운 칸으로
      scrollToIndex(nearestIndex(), true);
    };

    /*
      드래그를 끝낸 지점에 버튼이 있으면 그게 눌린다. 컬럼을 밀었을 뿐인데 할 일이
      완료 처리되면 곤란하다 — capture 단계에서 그 클릭 한 번을 삼킨다.
    */
    const onClickCapture = (e: MouseEvent) => {
      if (!dragged) return;
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
    };

    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', onPointerUp);
    scroller.addEventListener('pointercancel', onPointerUp);
    scroller.addEventListener('click', onClickCapture, true);

    return () => {
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', onPointerUp);
      scroller.removeEventListener('pointercancel', onPointerUp);
      scroller.removeEventListener('click', onClickCapture, true);
    };
  }, [nearestIndex, scrollToIndex, scrollerEl]);

  const goTo = useCallback(
    (index: number) => scrollToIndex(index, true),
    [scrollToIndex]
  );

  const registerNode = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      nodeRefs.current[index] = el;
    },
    []
  );

  return { scrollerRef: setScrollerRef, activeIndex, onScroll, goTo, registerNode };
}
