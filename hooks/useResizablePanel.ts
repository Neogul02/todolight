'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

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
 * **높이는 손잡이로만 바뀐다.** 예전엔 달력에서 날짜를 누르면 목록을 반쯤 펴 주는 길이
 * 하나 더 있었는데, 날짜를 누르는 건 대부분 "이 날 뭐 있나" 훑는 동작이라 누를 때마다
 * 보려던 달력이 줄어들었다. 크기를 바꾸는 곳은 손잡이 하나뿐이어야 예측이 된다.
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
 * 정확히 끄는 것보다 한 번 누르는 쪽이 빠를 때가 많다 — 다만 **누르기는 곁다리이고
 * 끌기가 본체다.** 폰에서 끌리지 않으면 이 패널은 사실상 없는 기능이다.
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

  /*
    **지금 비율을 ref로도 들고 있는다.**

    놓는 순간 "얼마나 끌었나"를 판정하려면 그 시점의 최신 비율이 필요한데, state는 그리기
    위한 값이라 이벤트 핸들러가 잡고 있는 값이 한 박자 전일 수 있다. 실제로 그러면
    이동량이 0으로 계산돼 **끌던 손을 떼는 순간 시작한 칸으로 되돌아갔다** — 화면에서는
    "손가락은 따라왔는데 놓으면 원위치", 즉 드래그가 안 되는 것으로 보인다.
    제스처 판정은 ref로, 그리기는 state로 한다.
  */
  const ratioRef = useRef(snaps[initial]);
  const start = useRef<{ y: number; ratio: number; height: number; moved: boolean } | null>(null);
  /** 창에 붙인 리스너를 떼는 함수. 드래그가 끝나거나 컴포넌트가 사라질 때 부른다 */
  const detach = useRef<(() => void) | null>(null);

  const min = snaps[0];
  const max = snaps[snaps.length - 1];

  const applyRatio = useCallback((next: number) => {
    ratioRef.current = next;
    setRatio(next);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      const clamped = Math.min(snaps.length - 1, Math.max(0, index));
      applyRatio(snaps[clamped]);
    },
    [snaps, applyRatio]
  );

  /** 지금 비율이 몇 번째 스냅에 가장 가까운지 */
  const nearestIndex = useCallback(
    (value: number): number => {
      let best = 0;
      snaps.forEach((s, i) => {
        if (Math.abs(s - value) < Math.abs(snaps[best] - value)) best = i;
      });
      return best;
    },
    [snaps]
  );

  /** 드래그를 확정한다 — 끌었으면 한 칸, 누른 것이었으면 다음 칸 */
  const finish = useCallback(
    (committed: boolean) => {
      const s = start.current;
      if (!s) return;
      start.current = null;
      detach.current?.();
      detach.current = null;
      setDragging(false);

      const from = nearestIndex(s.ratio);

      if (!s.moved) {
        // 4px도 안 움직였다. 브라우저가 가져간 제스처였다면(committed=false) 아무 일도
        // 없어야 한다 — 여기서 "눌렀다"로 치면 패널이 저 혼자 다음 칸으로 뛴다.
        if (committed) goTo((from + 1) % snaps.length);
        else applyRatio(s.ratio);
        return;
      }

      // 얼마나 멀리 끌었든 한 칸만 움직인다. 모자라게 끌었으면 제자리.
      const moved = ratioRef.current - s.ratio;
      const step = Math.abs(moved) < STEP_RATIO ? 0 : Math.sign(moved);
      goTo(from + step);
    },
    [goTo, nearestIndex, snaps, applyRatio]
  );

  function onPointerDown(e: ReactPointerEvent) {
    if (!enabled) return;
    const height = containerRef.current?.clientHeight ?? 0;
    if (!height) return;

    start.current = { y: e.clientY, ratio: ratioRef.current, height, moved: false };
    setDragging(true);

    /*
      **움직임과 놓기를 창에서 받는다.**

      예전에는 손잡이 자신에게 붙인 React 핸들러 + setPointerCapture로 받았는데, 폰에서
      이게 자주 끊긴다 — 손가락이 손잡이 밖으로 나가거나, 브라우저가 이 세로 제스처를
      스크롤로 판정하려 하거나, 두 번째 손가락이 닿으면 캡처가 풀리면서 그 뒤 이벤트가
      아예 안 온다. 그러면 화면은 끌리다 만 자리에 멈추고 사용자에게는 "드래그가 안 된다"로
      보인다. 창에 직접 붙이면 포인터가 어디로 가든 끝까지 따라온다.

      passive: false — 여기서 preventDefault를 불러야 브라우저가 같은 제스처를 페이지
      스크롤로 겹쳐 해석하지 않는다. touch-action: none이 터치는 이미 막지만 마우스는
      그 속성의 영향을 받지 않는다.
    */
    const onMove = (ev: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      ev.preventDefault();
      const delta = s.y - ev.clientY;
      if (!s.moved && Math.abs(delta) < DRAG_SLOP_PX) return;
      s.moved = true;
      // 위로 끌면(y가 작아지면) 목록이 커지고 달력이 줄어든다
      applyRatio(Math.min(max, Math.max(min, s.ratio + delta / s.height)));
    };
    const onUp = () => finish(true);
    /*
      브라우저가 제스처를 가져갔다. 4px도 안 움직였으면 아무 일 없이 되돌리지만,
      **이미 끌고 있었다면 놓은 것으로 친다.** 취소를 무조건 되돌림으로 처리하면,
      한참 끌어 놓고도 마지막에 취소가 한 번 끼는 순간 전부 없던 일이 된다 —
      폰에서 "끌리긴 하는데 놓으면 원위치"로 나타난다.
    */
    const onCancel = () => finish(start.current?.moved === true);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    detach.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };

    e.preventDefault();
  }

  // 드래그 도중에 화면이 바뀌면(뷰 전환 등) 리스너가 창에 남는다
  useEffect(() => () => detach.current?.(), []);

  return {
    /** 컨테이너 높이 대비 패널 높이 (0~1) */
    ratio: enabled ? ratio : snaps[initial],
    dragging,
    /** 핸들에 그대로 펼쳐서 붙인다 */
    handleProps: { onPointerDown },
  };
}
