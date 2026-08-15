/**
 * 완료 체크 같은 순간에 짧게 울리는 햅틱.
 *
 * iOS Safari는 Vibration API 자체를 구현하지 않는다(홈 화면에 추가한 PWA에서도 마찬가지) —
 * 이 프로젝트의 기준 기기(iPhone 15/16 Pro)에서는 느껴지지 않는다. Android Chrome 등
 * 지원하는 브라우저에서만 동작하는 점진적 기능 강화로 다룬다. `'vibrate' in navigator`로
 * 검사하니 미지원 환경에서도 그냥 조용히 아무 일도 안 한다.
 */
export function vibrateTick(ms = 15): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // 일부 브라우저는 사용자 제스처 밖에서 부르면 조용히 실패한다 — 무시해도 된다
  }
}
