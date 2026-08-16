'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** 탭과 드래그를 가르는 거리. 이보다 덜 움직였으면 누른 것으로 친다 */
const DRAG_SLOP_PX = 4;

/**
 * 한 칸 옮기는 데 필요한 최소 이동량(컨테이너 높이 대비).
 * 이보다 덜 움직였으면 제자리로 돌아간다.
 */
const STEP_RATIO = 0.08;

/**
 * 위아래로 끌어 높이를 바꾸는 패널.
 *
 * 높이를 px가 아니라 **컨테이너 대비 비율**로 들고 있는다 — 폰마다 화면 높이가 다르고
 * 주소창이 접혔다 펴지며 dvh가 실시간으로 바뀌는데, px로 잡아 두면 그때마다 비율이 어긋난다.
 *
 * 놓으면 스냅으로 붙는다. 자유 높이 그대로 두면 한 번 어중간하게 놓았을 때 다음에 열 때도
 * 계속 어중간하고, "달력을 크게" 같은 의도가 매번 손끝 정확도에 걸린다.
 *
 * 붙는 곳은 **시작한 칸의 바로 옆 칸**이지 "가장 가까운 칸"이 아니다. 가장 가까운 칸으로
 * 붙이면 손가락을 조금 크게 움직였을 때 두 칸이 한 번에 뛴다 — 달력을 한 단계만 줄이려
 * 했는데 최대까지 접혀서 찌그러진 것처럼 보였다. 한 번의 드래그는 한 칸이다.
 *
 * 핸들은 끌 수도 있고 누를 수도 있다(누르면 다음 스냅으로). 작은 화면에서 몇 픽셀을
 * 정확히 끄는 것보다 한 번 누르는 쪽이 빠를 때가 많다.
 */
export function useResizablePanel({
  snaps,
  initial = 0,
  containerRef,
  enabled = true,
}: {
  /** 컨테이너 높이 대비 비율. 작은 것부터 큰 것 순으로 */
  snaps: number[];
  initial?: number;
  containerRef: RefObject<HTMLElement | null>;
  /** 데스크톱처럼 패널이 고정 높이를 가질 이유가 없는 곳에서는 끈다 */
  enabled?: boolean;
}) {
  const [ratio, setRatio] = useState(snaps[initial]);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; ratio: number; height: number; moved: boolean } | null>(null);

  const min = snaps[0];
  const max = snaps[snaps.length - 1];

  function goTo(index: number) {
    const clamped = Math.min(snaps.length - 1, Math.max(0, index));
    setRatio(snaps[clamped]);
  }

  /** 지금 비율이 몇 번째 스냅에 가장 가까운지 */
  function nearestIndex(value: number): number {
    let best = 0;
    snaps.forEach((s, i) => {
      if (Math.abs(s - value) < Math.abs(snaps[best] - value)) best = i;
    });
    return best;
  }

  /** 적어도 이 스냅만큼은 펴 준다 — 날짜를 눌렀는데 목록이 안 보이면 누른 보람이 없다 */
  function expandAtLeast(index: number) {
    if (!enabled) return;
    if (nearestIndex(ratio) < index) goTo(index);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (!enabled) return;
    const height = containerRef.current?.clientHeight ?? 0;
    if (!height) return;
    start.current = { y: e.clientY, ratio, height, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    /*
      touch-none(touch-action: none)은 터치·펜에만 적용돼서 손가락 드래그가 페이지 스크롤로
      새는 건 이미 막혀 있다. 마우스는 touch-action의 영향을 아예 안 받는다 — 마우스로 이
      손잡이를 눌러 끌면 캡처된 포인터로 리사이즈는 되지만, 그와 별개로 브라우저가 같은
      드래그를 "텍스트 선택 후 화면 끝에서 자동 스크롤"로도 해석해서 페이지 전체가 같이
      움직인다. preventDefault로 그 기본 동작 자체를 막는다.
    */
    e.preventDefault();
  }

  function onPointerMove(e: ReactPointerEvent) {
    const s = start.current;
    if (!s) return;
    e.preventDefault();
    const delta = s.y - e.clientY;
    if (!s.moved && Math.abs(delta) < DRAG_SLOP_PX) return;
    s.moved = true;
    // 위로 끌면(y가 작아지면) 목록이 커지고 달력이 줄어든다
    setRatio(Math.min(max, Math.max(min, s.ratio + delta / s.height)));
  }

  function onPointerUp() {
    const s = start.current;
    if (!s) return;
    start.current = null;
    setDragging(false);
    const from = nearestIndex(s.ratio);

    // 끌지 않고 눌렀다 뗐으면 다음 단계로 — 끝까지 갔으면 처음으로 돌아온다
    if (!s.moved) {
      goTo((from + 1) % snaps.length);
      return;
    }

    // 얼마나 멀리 끌었든 한 칸만 움직인다. 모자라게 끌었으면 제자리.
    const moved = ratio - s.ratio;
    const step = Math.abs(moved) < STEP_RATIO ? 0 : Math.sign(moved);
    goTo(from + step);
  }

  return {
    /** 컨테이너 높이 대비 패널 높이 (0~1) */
    ratio: enabled ? ratio : snaps[initial],
    dragging,
    expandAtLeast,
    /** 핸들에 그대로 펼쳐서 붙인다 */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
