import type { KeyboardEvent } from 'react';

/**
 * `enterKeyHint="next"`를 단 칸에서 "다음"을 눌렀을 때 실제로 다음 칸으로 포커스를 옮긴다.
 *
 * `<form>` 안의 텍스트 입력에서 Enter는 브라우저가 곧바로 폼을 제출한다(implicit submission).
 * 그래서 키보드에는 "다음"이라고 적어 두고 실제로는 절반만 채운 채 제출되거나, 제출 조건을
 * 못 넘겨 **아무 일도 안 일어난 것처럼** 보였다. 여기서 기본 동작을 막고 직접 옮긴다.
 *
 * 한글을 조합하는 중(`isComposing`)이면 건너뛴다 — 그 Enter는 글자를 확정하는 키다.
 * 이걸 빠뜨리면 "커피"를 치고 넘어가는 순간 마지막 글자가 끊긴다.
 *
 * ref가 아니라 **엘리먼트**를 받는다. 호출도 핸들러 안에서 한다:
 * `onKeyDown={e => focusNextOnEnter(e, titleRef.current)}`
 * ref나 ref를 읽는 함수를 렌더 중에 넘기면 `react-hooks/refs`가 막고, 실제로도 값은
 * 키를 누르는 순간에 읽는 게 맞다.
 *
 * 마지막 칸에는 달지 않는다 — 거기서는 브라우저의 기본 제출이 그대로 맞다.
 */
export function focusNextOnEnter(e: KeyboardEvent, next: HTMLElement | null): void {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
  e.preventDefault();
  next?.focus();
}

/**
 * `<form>` 밖에 홀로 있는 입력칸에서 Enter로 동작을 실행한다(설정 화면의 이름 칸 등).
 * 폼이 없으면 브라우저가 대신 제출해 주지 않아서 Enter가 그냥 먹힌다.
 */
export function submitOnEnter(e: KeyboardEvent, run: () => void): void {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
  e.preventDefault();
  run();
}
